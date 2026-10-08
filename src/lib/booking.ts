/**
 * Booking service: creation under write lock, temporary holds (reservation
 * locks), status transitions with history, price calculation, commission.
 */
import crypto from "node:crypto";
import { getDb, tx } from "./db";
import { ApiError } from "./api";
import { slotIsFree, toMin } from "./availability";
import { notify } from "./notify";

export const HOLD_MINUTES = Number(process.env.BOOKING_HOLD_MINUTES || 10);

export interface BookingRow {
  id: number;
  ref: string;
  status: string;
  [k: string]: any;
}

export function generateRef(): string {
  const d = new Date();
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase().slice(0, 5);
  return `BYS-${ymd}-${rand}`;
}

export interface PriceInput {
  treatment: any;
  guests: number;
  serviceType: "in_spa" | "doorstep";
  promo?: { kind: "percent" | "fixed"; value: number; code: string } | null;
}

export interface PriceQuote {
  unitPrice: number;
  subtotal: number;
  discount: number;
  promoDiscount: number;
  travelFee: number;
  serviceFee: number;
  tax: number;
  total: number;
  currency: string;
}

/** Tax rate from settings (default 0 — prices shown tax-inclusive in Indonesia). */
function taxRate(): number {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = 'tax_rate'").get() as any;
  return row ? Number(row.value) : 0;
}
function serviceFeeRate(): number {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = 'service_fee_rate'").get() as any;
  return row ? Number(row.value) : 0;
}

export function quotePrice(input: PriceInput): PriceQuote {
  const { treatment, guests, serviceType, promo } = input;
  const currency = treatment.currency || "IDR";
  const unit = Math.round(treatment.price * (1 - (treatment.discount || 0) / 100));
  const subtotal = unit * guests;
  const travelFee = serviceType === "doorstep" ? treatment.travel_fee || 0 : 0;
  const serviceFee = Math.round((subtotal + travelFee) * serviceFeeRate());
  let promoDiscount = 0;
  if (promo) {
    promoDiscount =
      promo.kind === "percent" ? Math.round((subtotal * promo.value) / 100) : Math.min(promo.value, subtotal);
  }
  const taxable = Math.max(0, subtotal - promoDiscount) + travelFee + serviceFee;
  const tax = Math.round(taxable * taxRate());
  return {
    unitPrice: unit,
    subtotal,
    discount: promoDiscount,
    promoDiscount,
    travelFee,
    serviceFee,
    tax,
    total: taxable + tax,
    currency,
  };
}

export interface CreateBookingInput {
  customerId: number;
  spaId: number;
  branchId: number;
  treatmentId: number;
  therapistPreference: "any" | "specific";
  therapistId?: number | null;
  date: string;
  time: string;
  guests: number;
  serviceType: "in_spa" | "doorstep";
  customer: {
    name: string;
    email: string;
    phone?: string;
    whatsapp?: string;
    country?: string;
    specialRequest?: string;
  };
  address?: string;
  lat?: number;
  lng?: number;
  promoCode?: string;
}

/** Validate a promo code against booking value/scope/date. */
export function validatePromo(code: string, treatment: any, subtotal: number, customerId: number) {
  const db = getDb();
  const p = db
    .prepare("SELECT * FROM promotions WHERE code = ? COLLATE NOCASE AND active = 1")
    .get(code) as any;
  if (!p) throw new ApiError(400, "Invalid promo code.");
  const now = new Date().toISOString();
  if (now < p.starts_at || now > p.ends_at) throw new ApiError(400, "This promo has expired.");
  if (p.max_uses && p.used_count >= p.max_uses) throw new ApiError(400, "This promo has reached its usage limit.");
  if (subtotal < p.min_value) throw new ApiError(400, `Minimum booking value for this promo is ${p.min_value}.`);
  if (p.scope === "spa" && p.spa_id !== treatment.spa_id)
    throw new ApiError(400, "Promo is not valid for this spa.");
  if (p.scope === "treatment" && p.treatment_id !== treatment.id)
    throw new ApiError(400, "Promo is not valid for this treatment.");
  if (p.scope === "destination") {
    const spa = db.prepare("SELECT city FROM spas WHERE id = ?").get(treatment.spa_id) as any;
    if ((spa?.city || "").toLowerCase() !== String(p.destination || "").toLowerCase())
      throw new ApiError(400, "Promo is not valid for this destination.");
  }
  if (p.scope === "first_booking") {
    const prior = db
      .prepare("SELECT 1 FROM bookings WHERE customer_id = ? AND status NOT IN ('cancelled')")
      .get(customerId);
    if (prior) throw new ApiError(400, "Promo is only valid for your first booking.");
  }
  return p;
}

/**
 * Creates a booking inside an IMMEDIATE transaction after re-verifying the
 * slot — this is the double-booking guard. The booking starts in
 * `payment_pending` with a hold expiry; unpaid holds are released by
 * releaseExpiredHolds().
 */
export function createBooking(input: CreateBookingInput): BookingRow {
  const db = getDb();
  return tx(() => {
    const treatment = db.prepare("SELECT * FROM treatments WHERE id = ?").get(input.treatmentId) as any;
    if (!treatment || treatment.status !== "active") throw new ApiError(404, "Treatment not found.");
    const spa = db.prepare("SELECT * FROM spas WHERE id = ?").get(input.spaId) as any;
    if (!spa || spa.status !== "published") throw new ApiError(400, "Spa is not available for booking.");
    const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(spa.supplier_id) as any;
    if (!supplier || supplier.status !== "approved")
      throw new ApiError(400, "Spa is not currently accepting bookings.");

    // authoritative availability check (also runs busy queries inside this tx)
    const check = slotIsFree({
      spaId: input.spaId,
      branchId: input.branchId,
      treatmentId: input.treatmentId,
      date: input.date,
      time: input.time,
      guests: input.guests,
      serviceType: input.serviceType,
      therapistId: input.therapistPreference === "specific" ? input.therapistId ?? null : null,
    });
    if (!check.ok) throw new ApiError(409, check.reason || "Slot no longer available.");

    let promo: any = null;
    const guests = Math.max(1, Math.min(input.guests, treatment.max_guests));
    const baseQuote = quotePrice({
      treatment,
      guests,
      serviceType: input.serviceType,
    });
    if (input.promoCode) {
      promo = validatePromo(input.promoCode, treatment, baseQuote.subtotal, input.customerId);
    }
    const quote = quotePrice({
      treatment,
      guests,
      serviceType: input.serviceType,
      promo: promo ? { kind: promo.kind, value: promo.value, code: promo.code } : null,
    });

    const therapistId = check.therapistIds?.[0] ?? null;
    const roomId = check.roomIds?.[0] ?? null;
    const ref = generateRef();
    const hold = new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString();
    const cancelPolicy = `Free cancellation up to ${spa.cancel_hours} hours before the appointment.`;

    const info = db
      .prepare(
        `INSERT INTO bookings
          (ref, customer_id, spa_id, branch_id, treatment_id, therapist_id, room_id,
           booking_date, start_time, duration_min, guests, service_type, address, lat, lng,
           customer_name, customer_email, customer_phone, customer_whatsapp, customer_country,
           special_request, therapist_preference, status, hold_expires_at,
           subtotal, discount, travel_fee, service_fee, tax, total, currency, promo_code, cancel_policy)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        ref,
        input.customerId,
        input.spaId,
        input.branchId,
        input.treatmentId,
        therapistId,
        roomId,
        input.date,
        input.time,
        treatment.duration_min,
        guests,
        input.serviceType,
        input.address ?? null,
        input.lat ?? null,
        input.lng ?? null,
        input.customer.name,
        input.customer.email,
        input.customer.phone ?? null,
        input.customer.whatsapp ?? null,
        input.customer.country ?? null,
        input.customer.specialRequest ?? null,
        input.therapistPreference,
        "payment_pending",
        hold,
        quote.subtotal,
        quote.promoDiscount,
        quote.travelFee,
        quote.serviceFee,
        quote.tax,
        quote.total,
        quote.currency,
        promo?.code ?? null,
        cancelPolicy
      );
    const bookingId = Number(info.lastInsertRowid);

    // Record EVERY therapist/room occupied by this booking (multi-guest parties)
    const insAssign = db.prepare(
      `INSERT INTO booking_assignments (booking_id, therapist_id, room_id, booking_date, start_time, status, guest_index)
       VALUES (?,?,?,?,?,'payment_pending',?)`
    );
    check.therapistIds?.forEach((tid, i) => {
      insAssign.run(bookingId, tid, check.roomIds?.[i] ?? check.roomIds?.[0] ?? null, input.date, input.time, i);
    });

    db.prepare(
      `INSERT INTO booking_events (booking_id, from_status, to_status, note, actor_id, actor_role)
       VALUES (?,?,?,?,?,?)`
    ).run(bookingId, null, "payment_pending", "Booking created — awaiting payment", input.customerId, "customer");

    if (promo) {
      db.prepare("UPDATE promotions SET used_count = used_count + 1 WHERE id = ?").run(promo.id);
    }

    const supplierUser = db.prepare("SELECT user_id FROM suppliers WHERE id = ?").get(spa.supplier_id) as any;
    if (supplierUser) {
      notify(supplierUser.user_id, "new_booking", "New booking received",
        `${input.customer.name} · ${treatment.name} · ${input.date} ${input.time}`, "/supplier/bookings");
    }
    return db.prepare("SELECT * FROM bookings WHERE id = ?").get(bookingId) as BookingRow;
  });
}

/**
 * Releases holds where payment was not completed in time.
 * Called opportunistically from availability/booking endpoints (no cron needed).
 */
export function releaseExpiredHolds(): number {
  const db = getDb();
  const expired = db
    .prepare(
      `SELECT id FROM bookings
        WHERE status = 'payment_pending'
          AND hold_expires_at IS NOT NULL
          AND hold_expires_at < datetime('now')`
    )
    .all() as any[];
  if (!expired.length) return 0;
  const upd = db.prepare(
    "UPDATE bookings SET status = 'cancelled', hold_expires_at = NULL, updated_at = datetime('now') WHERE id = ?"
  );
  const updAssign = db.prepare("UPDATE booking_assignments SET status = 'cancelled' WHERE booking_id = ?");
  const evt = db.prepare(
    `INSERT INTO booking_events (booking_id, from_status, to_status, note, actor_role)
     VALUES (?, 'payment_pending', 'cancelled', 'Payment hold expired — slot released', 'system')`
  );
  const clear = db.prepare("UPDATE booking_holds SET released = 1 WHERE expires_at < datetime('now') AND released = 0");
  for (const r of expired) {
    upd.run(r.id);
    updAssign.run(r.id);
    evt.run(r.id);
  }
  clear.run();
  return expired.length;
}

export type BookingStatus =
  | "pending" | "payment_pending" | "confirmed" | "voucher_issued" | "in_treatment"
  | "completed" | "cancelled" | "refunded" | "no_show";

const STATUS_FLOW: Record<string, string[]> = {
  pending: ["payment_pending", "confirmed", "cancelled"],
  payment_pending: ["confirmed", "cancelled"],
  confirmed: ["voucher_issued", "in_treatment", "completed", "cancelled", "no_show", "refunded"],
  voucher_issued: ["in_treatment", "completed", "cancelled", "no_show", "refunded"],
  in_treatment: ["completed", "cancelled", "refunded"],
  completed: ["refunded"],
  cancelled: ["refunded"],
  refunded: [],
  no_show: [],
};

export function changeBookingStatus(
  bookingId: number,
  to: BookingStatus,
  actor: { id?: number | null; role: string },
  note?: string
): BookingRow {
  const db = getDb();
  return tx(() => {
    const b = db.prepare("SELECT * FROM bookings WHERE id = ?").get(bookingId) as BookingRow;
    if (!b) throw new ApiError(404, "Booking not found.");
    if (b.status === to) return b;
    if (!STATUS_FLOW[b.status]?.includes(to)) {
      throw new ApiError(409, `Cannot change booking from ${b.status} to ${to}.`);
    }
    db.prepare("UPDATE bookings SET status = ?, hold_expires_at = NULL, updated_at = datetime('now') WHERE id = ?").run(to, bookingId);
    db.prepare("UPDATE booking_assignments SET status = ? WHERE booking_id = ?").run(to, bookingId);
    db.prepare(
      "INSERT INTO booking_events (booking_id, from_status, to_status, note, actor_id, actor_role) VALUES (?,?,?,?,?,?)"
    ).run(bookingId, b.status, to, note ?? null, actor.id ?? null, actor.role);

    if (to === "confirmed" || to === "voucher_issued") {
      notify(b.customer_id, "booking_confirmed", "Booking confirmed",
        `Your booking ${b.ref} at ${b.booking_date} ${b.start_time} is confirmed.`, `/dashboard/bookings/${b.ref}`);
    }
    if (to === "cancelled") {
      notify(b.customer_id, "booking_cancelled", "Booking cancelled",
        `Booking ${b.ref} has been cancelled.`, `/dashboard/bookings/${b.ref}`);
    }
    return db.prepare("SELECT * FROM bookings WHERE id = ?").get(bookingId) as BookingRow;
  });
}
