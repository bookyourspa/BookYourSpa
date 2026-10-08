import { z } from "zod";
import { handler, parseBody, ApiError } from "@/lib/api";
import { getDb } from "@/lib/db";
import { changeBookingStatus, releaseExpiredHolds } from "@/lib/booking";
import { loadBooking } from "@/lib/booking-queries";

/** GET /api/bookings/[ref] — booking detail + events + payment. */
export const GET = handler({ auth: "customer:book" }, async (_req, { params, user }) => {
  releaseExpiredHolds();
  const db = getDb();
  const b = loadBooking(params.ref, user!);
  const events = db
    .prepare("SELECT from_status, to_status, note, actor_role, created_at FROM booking_events WHERE booking_id = ? ORDER BY id")
    .all(b.id);
  const payment = db.prepare("SELECT * FROM payments WHERE booking_id = ? ORDER BY id DESC LIMIT 1").get(b.id);
  const spa = db.prepare("SELECT id, name, slug, city, address, phone, whatsapp, lat, lng, cancel_hours FROM spas WHERE id = ?").get(b.spa_id);
  const treatment = db.prepare("SELECT id, name, duration_min, images FROM treatments WHERE id = ?").get(b.treatment_id);
  const therapist = b.therapist_id
    ? db.prepare("SELECT id, name, photo_url FROM therapists WHERE id = ?").get(b.therapist_id)
    : null;
  const review = db.prepare("SELECT * FROM reviews WHERE booking_id = ?").get(b.id);
  const voucher = db.prepare("SELECT value, kind FROM promotions WHERE code = ?").get(b.promo_code || "");
  return { booking: b, events, payment, spa, treatment, therapist, review, promo: voucher };
});

const cancelSchema = z.object({ reason: z.string().max(500).optional() });

/** POST /api/bookings/[ref]/cancel — customer or admin cancellation. */
export const POST = handler({ auth: "customer:book" }, async (req, { params, user }) => {
  const { reason } = await parseBody(req, cancelSchema);
  const b = loadBooking(params.ref, user!);
  // Cancellation policy: within free window requires admin/supplier approval path
  const spa = getDb().prepare("SELECT cancel_hours FROM spas WHERE id = ?").get(b.spa_id) as any;
  const startsAt = new Date(`${b.booking_date}T${b.start_time}:00`).getTime();
  const hoursBefore = (startsAt - Date.now()) / 3600_000;
  const withinFree = hoursBefore >= (spa?.cancel_hours ?? 24);
  if (!withinFree && user!.role !== "admin") {
    throw new ApiError(409, `Free cancellation window has passed (${spa?.cancel_hours ?? 24}h). Contact the spa or support to cancel.`);
  }
  const updated = changeBookingStatus(b.id, "cancelled", { id: user!.id, role: user!.role }, reason || "Cancelled by customer");
  return { booking: updated, refundEligible: withinFree };
});
