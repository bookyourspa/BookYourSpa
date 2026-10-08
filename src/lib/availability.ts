/**
 * Real-time availability engine.
 *
 * Computes genuinely free slots for:
 *   Spa + Branch + Treatment + Therapist + Date + Time + Duration
 *   + Number of Guests + Room/Resource
 *
 * All times are spa-local "HH:MM" strings; dates are "YYYY-MM-DD".
 */
import { getDb } from "./db";

export const SLOT_GRANULARITY_MIN = 30;

export interface AvailabilityInput {
  spaId: number;
  branchId: number;
  treatmentId: number;
  date: string;
  guests: number;
  serviceType: "in_spa" | "doorstep";
  /** Specific therapist when the customer picked "Select Therapist". */
  therapistId?: number | null;
}

export interface Slot {
  time: string;
  therapistIds: number[];
  roomsFree: number;
}

export interface TherapistStatus {
  therapistId: number;
  name: string;
  /** Available | Treatment | Break | Off | Not Available */
  status: "Available" | "Treatment" | "Break" | "Off" | "Not Available";
}

export interface AvailabilityResult {
  slots: Slot[];
  therapistStatuses: TherapistStatus[];
  meta: {
    durationMin: number;
    openFrom: string | null;
    openTo: string | null;
    therapistsNeeded: number;
    roomsNeeded: number;
    bufferMin: number;
    fullyBooked: boolean;
    spaOpen: boolean;
  };
}

export const toMin = (t: string): number => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
export const toHHMM = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const weekdayOf = (date: string): number => new Date(`${date}T00:00:00Z`).getUTCDay();

interface Interval {
  start: number;
  end: number;
}
const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;

/** Active booking statuses that occupy a therapist/room. */
const ACTIVE_STATUSES = ["pending", "payment_pending", "confirmed", "voucher_issued", "in_treatment"];

interface SpaContext {
  spa: any;
  branch: any;
  treatment: any;
}

export function loadContext(spaId: number, branchId: number, treatmentId: number): SpaContext {
  const db = getDb();
  const spa = db.prepare("SELECT * FROM spas WHERE id = ?").get(spaId) as any;
  const branch = db.prepare("SELECT * FROM branches WHERE id = ? AND spa_id = ?").get(branchId, spaId) as any;
  const treatment = db.prepare("SELECT * FROM treatments WHERE id = ? AND spa_id = ?").get(treatmentId, spaId) as any;
  if (!spa || !branch || !treatment) throw new Error("spa, branch or treatment not found");
  const offered = db
    .prepare("SELECT 1 FROM treatment_branches WHERE treatment_id = ? AND branch_id = ?")
    .get(treatmentId, branchId);
  if (!offered) throw new Error("treatment is not offered at this branch");
  return { spa, branch, treatment };
}

/**
 * Operating window for the branch on a weekday: minutes since midnight.
 * Branch hours override spa hours; an explicit {"tue":["closed"]} entry wins
 * over the spa's default (it is a deliberate closure, not missing data).
 */
export function openWindow(branch: any, spa: any, date: string): Interval | null {
  const wd = weekdayOf(date);
  const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const read = (json: string | null): { hasEntry: boolean; interval: Interval | null } => {
    if (!json) return { hasEntry: false, interval: null };
    try {
      const hours = JSON.parse(json);
      const entry = hours[days[wd]];
      if (!entry || !Array.isArray(entry)) return { hasEntry: false, interval: null };
      if (entry.length < 2 || entry[0] === "closed") return { hasEntry: true, interval: null };
      return { hasEntry: true, interval: { start: toMin(entry[0]), end: toMin(entry[1]) } };
    } catch {
      return { hasEntry: false, interval: null };
    }
  };
  const b = read(branch.opening_hours);
  if (b.hasEntry) return b.interval;
  return read(spa.opening_hours).interval;
}

/** Candidate therapists: active, assigned to branch (or floating), qualified, gender match. */
export function candidateTherapists(
  spaId: number,
  branchId: number,
  treatmentId: number,
  treatment: any,
  specificId?: number | null
): any[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT t.* FROM therapists t
        WHERE t.spa_id = ?
          AND t.status = 'active'
          AND (t.branch_id IS NULL OR t.branch_id = ?)
          AND EXISTS (SELECT 1 FROM therapist_treatments tt
                       WHERE tt.therapist_id = t.id AND tt.treatment_id = ?)
        ORDER BY t.name`
    )
    .all(spaId, branchId, treatmentId) as any[];
  let list = rows;
  if (treatment.therapist_gender && treatment.therapist_gender !== "no_pref") {
    list = list.filter((t) => t.gender === treatment.therapist_gender || !t.gender);
  }
  if (specificId) list = list.filter((t) => t.id === specificId);
  return list;
}

/** Busy intervals for a set of therapists on a date (bookings + unexpired holds). */
export function busyByTherapist(therapistIds: number[], date: string): Map<number, Interval[]> {
  const db = getDb();
  const map = new Map<number, Interval[]>();
  if (!therapistIds.length) return map;
  const placeholders = therapistIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT a.therapist_id, b.start_time, b.duration_min, COALESCE(t.buffer_min,0) AS buffer_min
         FROM booking_assignments a
         JOIN bookings b ON b.id = a.booking_id
         LEFT JOIN treatments t ON t.id = b.treatment_id
        WHERE a.therapist_id IN (${placeholders}) AND b.booking_date = ?
          AND b.status IN ('pending','payment_pending','confirmed','voucher_issued','in_treatment')
          AND (b.hold_expires_at IS NULL OR b.hold_expires_at > datetime('now'))`
    )
    .all(...therapistIds, date) as any[];
  for (const r of rows) {
    const start = toMin(r.start_time);
    const end = start + r.duration_min + (r.buffer_min || 0);
    const arr = map.get(r.therapist_id) || [];
    arr.push({ start, end });
    map.set(r.therapist_id, arr);
  }
  // Pre-payment cart holds (booking_holds table)
  const holds = db
    .prepare(
      `SELECT therapist_id, start_time, end_time FROM booking_holds
        WHERE therapist_id IN (${placeholders}) AND hold_date = ?
          AND released = 0 AND expires_at > datetime('now')`
    )
    .all(...therapistIds, date) as any[];
  for (const r of holds) {
    const arr = map.get(r.therapist_id) || [];
    arr.push({ start: toMin(r.start_time), end: toMin(r.end_time) });
    map.set(r.therapist_id, arr);
  }
  return map;
}

export function busyByRoom(roomIds: number[], date: string): Map<number, Interval[]> {
  const db = getDb();
  const map = new Map<number, Interval[]>();
  if (!roomIds.length) return map;
  const placeholders = roomIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT b.room_id, b.start_time, b.duration_min, COALESCE(t.buffer_min,0) AS buffer_min
         FROM bookings b LEFT JOIN treatments t ON t.id = b.treatment_id
        WHERE b.room_id IN (${placeholders}) AND b.booking_date = ?
          AND b.status IN ('pending','payment_pending','confirmed','voucher_issued','in_treatment')
          AND (b.hold_expires_at IS NULL OR b.hold_expires_at > datetime('now'))`
    )
    .all(...roomIds, date) as any[];
  for (const r of rows) {
    const start = toMin(r.start_time);
    const arr = map.get(r.room_id) || [];
    arr.push({ start, end: start + r.duration_min + (r.buffer_min || 0) });
    map.set(r.room_id, arr);
  }
  return map;
}

/** Working schedule intervals for a therapist on a weekday (empty ⇒ not scheduled that day). */
function scheduleIntervals(therapistId: number, weekday: number): Interval[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT start_time, end_time FROM therapist_schedules WHERE therapist_id = ? AND weekday = ?"
    )
    .all(therapistId, weekday) as any[];
  return rows.map((r) => ({ start: toMin(r.start_time), end: toMin(r.end_time) }));
}

function isDayOff(therapistId: number, date: string): { off: boolean; reason: string | null } {
  const db = getDb();
  const row = db
    .prepare("SELECT reason FROM therapist_days_off WHERE therapist_id = ? AND off_date = ?")
    .get(therapistId, date) as any;
  if (!row) return { off: false, reason: null };
  return { off: true, reason: row.reason || "Off" };
}

/** True when [start,end) fits entirely inside one working interval with no busy overlap. */
function freeAt(intervals: Interval[], busy: Interval[], start: number, end: number): boolean {
  const inWindow = intervals.some((w) => start >= w.start && end <= w.end);
  if (!inWindow) return false;
  return !busy.some((b) => overlaps(b, { start, end }));
}

/**
 * Main entry: computes available start slots + per-therapist status table.
 */
export function computeAvailability(input: AvailabilityInput): AvailabilityResult {
  const { spa, branch, treatment } = loadContext(input.spaId, input.branchId, input.treatmentId);
  const weekday = weekdayOf(input.date);
  const duration = treatment.duration_min;
  const buffer = treatment.buffer_min || 0;
  const window = openWindow(branch, spa, input.date);

  const guests = Math.max(1, Math.min(input.guests || 1, treatment.max_guests));
  const therapistsNeeded = guests; // one therapist per guest
  // A treatment party occupies one room (couples share the suite).
  const roomsNeeded = treatment.room_required ? 1 : 0;

  const candidates = candidateTherapists(spa.id, branch.id, treatment.id, treatment, input.therapistId);
  const candIds = candidates.map((t) => t.id);
  const busyT = busyByTherapist(candIds, input.date);

  const rooms = getDb()
    .prepare("SELECT * FROM rooms WHERE branch_id = ? AND status = 'active'")
    .all(branch.id) as any[];
  const busyR = busyByRoom(rooms.map((r) => r.id), input.date);

  // Per-therapist schedule / day-off
  const schedMap = new Map<number, Interval[]>();
  const offMap = new Map<number, { off: boolean; reason: string | null }>();
  for (const t of candidates) {
    schedMap.set(t.id, scheduleIntervals(t.id, weekday));
    offMap.set(t.id, isDayOff(t.id, input.date));
  }

  const slots: Slot[] = [];
  if (window) {
    const step = SLOT_GRANULARITY_MIN;
    for (let s = window.start; s + duration <= window.end; s += step) {
      const e = s + duration;
      const free: number[] = [];
      for (const t of candidates) {
        const off = offMap.get(t.id)!;
        if (off.off) continue;
        const sched = schedMap.get(t.id) || [];
        if (!freeAt(sched, busyT.get(t.id) || [], s, e)) continue;
        free.push(t.id);
      }
      if (free.length < therapistsNeeded) continue;
      let roomsFree = rooms.length;
      if (roomsNeeded > 0) {
        let count = 0;
        for (const r of rooms) {
          const b = busyR.get(r.id) || [];
          if (!b.some((x) => overlaps(x, { start: s, end: e }))) count++;
        }
        roomsFree = count;
        if (count < roomsNeeded) continue;
      }
      slots.push({ time: toHHMM(s), therapistIds: free.slice(0, therapistsNeeded), roomsFree });
    }
  }

  return {
    slots,
    therapistStatuses: therapistStatusTable(candidates, schedMap, offMap, busyT, input.date),
    meta: {
      durationMin: duration,
      openFrom: window ? toHHMM(window.start) : null,
      openTo: window ? toHHMM(window.end) : null,
      therapistsNeeded,
      roomsNeeded,
      bufferMin: buffer,
      fullyBooked: slots.length === 0 && !!window,
      spaOpen: !!window && spa.status === "published" && branch.status === "active",
    },
  };
}

/**
 * Therapist availability column: name only + status
 * (Available | Treatment | Break | Off | Not Available).
 */
export function therapistStatusTable(
  candidates: any[],
  schedMap: Map<number, Interval[]>,
  offMap: Map<number, { off: boolean; reason: string | null }>,
  busy: Map<number, Interval[]>,
  date: string
): TherapistStatus[] {
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const isToday = date === new Date().toISOString().slice(0, 10);
  return candidates.map((t) => {
    const off = offMap.get(t.id)!;
    if (t.status !== "active") return { therapistId: t.id, name: t.name, status: "Not Available" as const };
    if (off.off) {
      const isBreak = (off.reason || "").toLowerCase().includes("break");
      return { therapistId: t.id, name: t.name, status: isBreak ? ("Break" as const) : ("Off" as const) };
    }
    const sched = schedMap.get(t.id) || [];
    const working = isToday ? sched.some((w) => nowMin >= w.start && nowMin < w.end) : sched.length > 0;
    if (!working) return { therapistId: t.id, name: t.name, status: "Not Available" as const };
    const busyNow = (busy.get(t.id) || []).some(
      (b) => (isToday ? nowMin >= b.start && nowMin < b.end : false)
    );
    if (busyNow) return { therapistId: t.id, name: t.name, status: "Treatment" as const };
    return { therapistId: t.id, name: t.name, status: "Available" as const };
  });
}

/**
 * Re-verifies a concrete slot inside a write transaction — the authoritative
 * double-booking check used when creating a booking.
 */
export function slotIsFree(input: AvailabilityInput & { time: string }): {
  ok: boolean;
  reason?: string;
  therapistIds?: number[];
  roomIds?: number[];
} {
  const { spa, branch, treatment } = loadContext(input.spaId, input.branchId, input.treatmentId);
  const window = openWindow(branch, spa, input.date);
  if (!window) return { ok: false, reason: "The spa is closed on this date." };
  const start = toMin(input.time);
  const end = start + treatment.duration_min;
  if (start < window.start || end > window.end) return { ok: false, reason: "Outside opening hours." };

  const guests = Math.max(1, Math.min(input.guests || 1, treatment.max_guests));
  const candidates = candidateTherapists(spa.id, branch.id, treatment.id, treatment, input.therapistId);
  const weekday = weekdayOf(input.date);
  const busyT = busyByTherapist(candidates.map((t) => t.id), input.date);

  const free: number[] = [];
  for (const t of candidates) {
    if (isDayOff(t.id, input.date).off) continue;
    if (!freeAt(scheduleIntervals(t.id, weekday), busyT.get(t.id) || [], start, end)) continue;
    free.push(t.id);
  }
  if (free.length < guests)
    return { ok: false, reason: "Not enough therapists available for the selected time." };

  const rooms = getDb()
    .prepare("SELECT * FROM rooms WHERE branch_id = ? AND status = 'active'")
    .all(branch.id) as any[];
  const busyR = busyByRoom(rooms.map((r) => r.id), input.date);
  const freeRooms: any[] = [];
  if (treatment.room_required) {
    for (const r of rooms) {
      if (!(busyR.get(r.id) || []).some((b) => overlaps(b, { start, end }))) {
        freeRooms.push(r);
      }
    }
    if (freeRooms.length < 1)
      return { ok: false, reason: "No treatment rooms free for the selected time." };
  }
  return { ok: true, therapistIds: free.slice(0, guests), roomIds: freeRooms.slice(0, guests).map((r) => r.id) };
}
