/** Real-time availability, slot maths and commission calculations. */
import { money, newId, nowIso } from './util';

export const SLOT_STEP_MIN = 15;
export const LEAD_TIME_MIN = 120; // minimum notice before a slot can be booked
export const ROOM_CAPACITY = 3;   // concurrent treatments the spa can host
export const MAX_DAYS_AHEAD = 120;
export const UNPAID_HOLD_MS = 30 * 60 * 1000;

export const parseTime = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

export const fmtTime = (mins: number) =>
  `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

/** Rules are stored Monday-first; JS dates are Sunday-first. */
export const dayIndexForDate = (date: string) => {
  const jsDay = new Date(`${date}T00:00:00Z`).getUTCDay();
  return (jsDay + 6) % 7;
};

export const isDateValid = (date: string) => {
  const t = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(t)) return false;
  const today = new Date();
  const todayStr = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;
  if (date < todayStr) return false;
  const limit = new Date(Date.now() + MAX_DAYS_AHEAD * 86400000);
  const limitStr = `${limit.getUTCFullYear()}-${String(limit.getUTCMonth() + 1).padStart(2, '0')}-${String(limit.getUTCDate()).padStart(2, '0')}`;
  return date <= limitStr;
};

type BookingRow = { start_time: string; end_time: string };

async function activeBookingsForDate(db: D1Database, spaId: string, date: string): Promise<BookingRow[]> {
  // Paid bookings and confirmed bookings hold capacity; unpaid requests hold it for 30 minutes.
  const cutoff = new Date(Date.now() - UNPAID_HOLD_MS).toISOString();
  const res = await db
    .prepare(`SELECT start_time, end_time FROM bookings
              WHERE spa_id = ? AND booking_date = ?
                AND (status = 'confirmed'
                     OR (status = 'pending' AND (payment_status = 'paid' OR created_at >= ?)))`)
    .bind(spaId, date, cutoff)
    .all<BookingRow>();
  return res.results;
}

export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

export type Slot = { time: string; available: boolean; reason?: string };

/**
 * Builds the full slot grid for a spa on a date.
 * A slot is available when: spa is open, not blocked, far enough in the future,
 * and fewer than ROOM_CAPACITY concurrent bookings overlap it.
 */
export async function getSlots(
  db: D1Database,
  spaId: string,
  date: string,
  durationMin: number,
  opts: { excludeBookingId?: string } = {}
): Promise<Slot[]> {
  if (!isDateValid(date)) return [];
  const duration = Math.max(15, Math.min(480, Math.round(durationMin)));

  const blocked = await db
    .prepare('SELECT 1 AS x FROM blocked_dates WHERE spa_id = ? AND blocked_date = ?')
    .bind(spaId, date)
    .first();
  if (blocked) return [];

  const rule = await db
    .prepare('SELECT open_time, close_time, closed FROM availability_rules WHERE spa_id = ? AND day_of_week = ?')
    .bind(spaId, dayIndexForDate(date))
    .first<{ open_time: string; close_time: string; closed: number }>();
  if (!rule || rule.closed) return [];

  const open = parseTime(rule.open_time);
  const close = parseTime(rule.close_time);
  const existing = await activeBookingsForDate(db, spaId, date);
  if (opts.excludeBookingId) {
    // reserved for future rescheduling flows
  }

  const now = new Date();
  const todayStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  const nowMins = now.getUTCHours() * 60 + now.getUTCMinutes();
  const earliest = date === todayStr ? nowMins + LEAD_TIME_MIN : -1;

  const slots: Slot[] = [];
  for (let start = open; start + duration <= close; start += SLOT_STEP_MIN) {
    if (start < earliest) continue;
    const end = start + duration;
    const busy = existing.filter((b) => overlaps(start, end, parseTime(b.start_time), parseTime(b.end_time))).length;
    const conflictSelf = false;
    slots.push({
      time: fmtTime(start),
      available: busy < ROOM_CAPACITY && !conflictSelf,
      reason: busy >= ROOM_CAPACITY ? 'fully_booked' : undefined,
    });
  }
  return slots;
}

export async function isSlotFree(
  db: D1Database,
  spaId: string,
  date: string,
  startTime: string,
  durationMin: number
): Promise<boolean> {
  const slots = await getSlots(db, spaId, date, durationMin);
  return slots.some((s) => s.time === startTime && s.available);
}

export function calcCommission(total: number, commissionPercent: number) {
  return money(total * (commissionPercent / 100));
}

export function priceAfterPromo(
  basePrice: number,
  promo: { discount_type: string; value: number; min_spend: number } | null
) {
  if (!promo) return { discount: 0, total: money(basePrice) };
  if (basePrice < promo.min_spend) return { discount: 0, total: money(basePrice) };
  const discount = promo.discount_type === 'percent'
    ? basePrice * (promo.value / 100)
    : Math.min(promo.value, basePrice);
  return { discount: money(discount), total: money(basePrice - discount) };
}

export const newBookingId = () => newId('bkg');
export const timestamp = () => nowIso();
