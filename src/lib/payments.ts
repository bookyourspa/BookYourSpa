/**
 * Modular payment architecture. A provider implements PaymentProvider; new
 * gateways (Stripe, Midtrans, Xendit, ...) can be added by registering
 * another implementation and selecting it via PAYMENT_PROVIDER.
 *
 * Raw card data is NEVER accepted or stored — providers expose their own
 * hosted/redirect fields and we only keep transaction ids + status.
 */
import crypto from "node:crypto";
import { getDb, tx } from "./db";
import { ApiError } from "./api";
import { changeBookingStatus, generateRef } from "./booking";
import { notify, notifyChannel } from "./notify";

export interface ChargeInput {
  bookingId: number;
  method: "card" | "qris" | "bank_transfer" | "wallet" | "cash";
  /** Token/reference returned by the gateway's hosted checkout (no PAN). */
  paymentToken?: string;
}
export interface ChargeResult {
  paymentId: number;
  status: "created" | "pending" | "paid" | "failed";
  transactionId: string;
  redirectUrl?: string;
}

export interface PaymentProvider {
  name: string;
  charge(input: ChargeInput, amount: number, currency: string): Promise<ChargeResult>;
  refund(paymentId: number, amount: number): Promise<{ status: string; transactionId: string }>;
}

/** Sandbox gateway: deterministic, works offline, never touches real money. */
class SandboxProvider implements PaymentProvider {
  name = "sandbox";
  async charge(input: ChargeInput, amount: number, currency: string): Promise<ChargeResult> {
    const txId = `SBX-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
    // "cash" method = pay at spa; everything else settles instantly in sandbox.
    const status = input.method === "cash" ? "pending" : "paid";
    return { paymentId: 0, status, transactionId: txId };
  }
  async refund(paymentId: number, amount: number) {
    return { status: "processed", transactionId: `SBX-RF-${paymentId}-${amount}` };
  }
}

const providers: Record<string, PaymentProvider> = {
  sandbox: new SandboxProvider(),
};
export function getProvider(name?: string): PaymentProvider {
  const key = name || process.env.PAYMENT_PROVIDER || "sandbox";
  const p = providers[key];
  if (!p) throw new ApiError(500, `Unknown payment provider: ${key}`);
  return p;
}
/** Register an additional gateway (used by future integrations / tests). */
export function registerProvider(p: PaymentProvider) {
  providers[p.name] = p;
}

/**
 * Creates the payment record and captures it through the provider, then
 * confirms the booking + writes the commission record atomically.
 */
export async function payBooking(input: ChargeInput): Promise<{ payment: any; booking: any }> {
  const db = getDb();
  const booking = db.prepare("SELECT * FROM bookings WHERE id = ?").get(input.bookingId) as any;
  if (!booking) throw new ApiError(404, "Booking not found.");
  if (booking.status === "confirmed" || booking.status === "voucher_issued") {
    throw new ApiError(409, "Booking is already paid.");
  }
  if (!["payment_pending", "pending"].includes(booking.status)) {
    throw new ApiError(409, `Booking is not payable (status: ${booking.status}).`);
  }
  if (booking.hold_expires_at && new Date(booking.hold_expires_at).getTime() < Date.now()) {
    changeBookingStatus(booking.id, "cancelled", { role: "system" }, "Payment hold expired");
    throw new ApiError(410, "Your reservation hold expired and the slot was released. Please book again.");
  }

  const provider = getProvider();
  const result = await provider.charge(input, booking.total, booking.currency);

  return tx(() => {
    const paymentId = Number(
      db
        .prepare(
          `INSERT INTO payments (booking_id, provider, method, amount, currency, status, transaction_id, provider_raw, paid_at)
           VALUES (?,?,?,?,?,?,?,?,?)`
        )
        .run(
          booking.id,
          provider.name,
          input.method,
          booking.total,
          booking.currency,
          result.status,
          result.transactionId,
          JSON.stringify({ paymentToken: input.paymentToken ? "provided" : null, sandbox: provider.name === "sandbox" }),
          result.status === "paid" ? new Date().toISOString() : null
        ).lastInsertRowid
    );

    if (result.status === "paid") {
      finalizePaidBooking(booking.id, paymentId);
    } else if (result.status === "pending") {
      db.prepare(
        "INSERT INTO booking_events (booking_id, from_status, to_status, note, actor_role) VALUES (?,?,?,?,?)"
      ).run(booking.id, booking.status, "pending", "Pay-at-spa payment pending", "system");
      db.prepare("UPDATE bookings SET status = 'pending', updated_at = datetime('now') WHERE id = ?").run(booking.id);
    }
    return {
      payment: db.prepare("SELECT * FROM payments WHERE id = ?").get(paymentId),
      booking: db.prepare("SELECT * FROM bookings WHERE id = ?").get(booking.id),
    };
  });
}

/** Confirms booking + commission after successful capture (inside a tx). */
export function finalizePaidBooking(bookingId: number, paymentId: number) {
  const db = getDb();
  const b = db.prepare("SELECT * FROM bookings WHERE id = ?").get(bookingId) as any;
  const spa = db.prepare("SELECT * FROM spas WHERE id = ?").get(b.spa_id) as any;
  const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(spa.supplier_id) as any;
  const treatment = db.prepare("SELECT name FROM treatments WHERE id = ?").get(b.treatment_id) as any;

  changeBookingStatus(bookingId, "confirmed", { role: "system" }, "Payment received");

  // Commission (configurable rate; supplier-specific override wins)
  const setting = db.prepare("SELECT value FROM settings WHERE key = 'commission_rate'").get() as any;
  const rate = supplier.commission_rate ?? Number(setting?.value ?? process.env.DEFAULT_COMMISSION_RATE ?? 10);
  const commissionAmount = Math.round((b.total * rate) / 100);
  db.prepare(
    `INSERT INTO commissions (booking_id, supplier_id, gross, rate, amount, net, status)
     VALUES (?,?,?,?,?,?, 'pending')
     ON CONFLICT(booking_id) DO UPDATE SET gross=excluded.gross, rate=excluded.rate,
       amount=excluded.amount, net=excluded.net`
  ).run(b.id, supplier.id, b.total, rate, commissionAmount, b.total - commissionAmount);

  // Transactional messages
  const vars = {
    ref: b.ref,
    name: b.customer_name,
    treatment: treatment?.name ?? "Treatment",
    guests: String(b.guests),
    date: b.booking_date,
    time: b.start_time,
    spa: spa.name,
    city: spa.city || "",
    total: String(b.total),
    amount: String(b.total),
    currency: b.currency,
  };
  notify(b.customer_id, "payment_received", "Payment received",
    `We received ${b.currency} ${b.total.toLocaleString()} for booking ${b.ref}.`, `/dashboard/bookings/${b.ref}`);
  notify(b.customer_id, "booking_confirmed", "Booking confirmed",
    `Your booking ${b.ref} is confirmed for ${b.booking_date} ${b.start_time}.`, `/dashboard/bookings/${b.ref}`);
  notifyChannel(b.customer_id, "payment_confirmation", vars, ["email"]);
  notifyChannel(b.customer_id, "booking_confirmation", vars, ["email", "whatsapp"]);

  const supplierUser = db.prepare("SELECT user_id FROM suppliers WHERE id = ?").get(supplier.id) as any;
  notify(supplierUser.user_id, "payment_received", "Payment received",
    `Payment for booking ${b.ref} received.`, `/supplier/bookings`);
}

/** Request a refund for a paid booking (admin/finance flow). */
export async function requestRefund(bookingId: number, amount: number, reason: string, actorId: number) {
  const db = getDb();
  const payment = db
    .prepare("SELECT * FROM payments WHERE booking_id = ? AND status = 'paid' ORDER BY id DESC LIMIT 1")
    .get(bookingId) as any;
  if (!payment) throw new ApiError(400, "No captured payment found for this booking.");

  const provider = getProvider(payment.provider);
  const res = await provider.refund(payment.id, amount);

  return tx(() => {
    db.prepare(
      "UPDATE payments SET refunded_amount = refunded_amount + ?, status = ?, refund_status = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(amount, payment.refunded_amount + amount >= payment.amount ? "refunded" : "partially_refunded", res.status, payment.id);
    db.prepare(
      `INSERT INTO refunds (payment_id, booking_id, amount, reason, status, requested_by, processed_at)
       VALUES (?,?,?,?, 'processed', ?, datetime('now'))`
    ).run(payment.id, bookingId, amount, reason, actorId);

    // Reverse commission proportionally
    const comm = db.prepare("SELECT * FROM commissions WHERE booking_id = ?").get(bookingId) as any;
    if (comm) {
      const reverse = Math.round((comm.amount * amount) / Math.max(1, payment.amount));
      db.prepare("UPDATE commissions SET amount = MAX(0, amount - ?), net = net + ? WHERE id = ?").run(
        reverse,
        reverse,
        comm.id
      );
    }
    const b = db.prepare("SELECT * FROM bookings WHERE id = ?").get(bookingId) as any;
    if (payment.refunded_amount + amount >= payment.amount && ["cancelled", "completed", "confirmed", "voucher_issued", "in_treatment"].includes(b.status)) {
      changeBookingStatus(bookingId, "refunded", { id: actorId, role: "admin" }, `Refund: ${reason}`);
    }
    notify(b.customer_id, "refund_processed", "Refund processed",
      `Your refund of ${b.currency} ${amount.toLocaleString()} for booking ${b.ref} has been processed.`, `/dashboard/bookings/${b.ref}`);
    notifyChannel(b.customer_id, "refund", { ref: b.ref, amount: String(amount), currency: b.currency }, ["email", "whatsapp"]);
    return db.prepare("SELECT * FROM payments WHERE id = ?").get(payment.id);
  });
}
