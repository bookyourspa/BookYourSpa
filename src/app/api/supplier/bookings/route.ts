import { z } from "zod";
import { handler, parseBody, ApiError } from "@/lib/api";
import { getDb } from "@/lib/db";
import { requireSupplierSpa } from "@/lib/supplier";
import { changeBookingStatus, BookingStatus } from "@/lib/booking";
import { notify } from "@/lib/notify";

/** GET /api/supplier/bookings?date=&status=&from=&to= */
export const GET = handler({ auth: "supplier:manage" }, async (req, { user }) => {
  const db = getDb();
  const spa = requireSupplierSpa(user!);
  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  const status = url.searchParams.get("status");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const where = ["b.spa_id = ?"];
  const params: any[] = [spa.id];
  if (date) { where.push("b.booking_date = ?"); params.push(date); }
  if (status) { where.push("b.status = ?"); params.push(status); }
  if (from) { where.push("b.booking_date >= ?"); params.push(from); }
  if (to) { where.push("b.booking_date <= ?"); params.push(to); }

  const bookings = db
    .prepare(
      `SELECT b.*, t.name AS treatment_name, th.name AS therapist_name, br.name AS branch_name,
              p.status AS payment_status, p.method AS payment_method
         FROM bookings b
         JOIN treatments t ON t.id = b.treatment_id
         LEFT JOIN therapists th ON th.id = b.therapist_id
         LEFT JOIN branches br ON br.id = b.branch_id
         LEFT JOIN payments p ON p.id = (SELECT MAX(id) FROM payments WHERE booking_id = b.id)
        WHERE ${where.join(" AND ")}
        ORDER BY b.booking_date DESC, b.start_time DESC
        LIMIT 500`
    )
    .all(...params);
  return { bookings };
});

const manageSchema = z.object({
  action: z.enum(["confirm", "start", "complete", "cancel", "no_show", "reschedule", "assign"]),
  bookingRef: z.string().min(4),
  /** reschedule */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  /** assign */
  therapistId: z.number().int().positive().optional(),
  note: z.string().max(500).optional(),
});

/**
 * POST /api/supplier/bookings — supplier booking actions:
 * confirm / start / complete / cancel / no_show / reschedule / assign.
 * Reschedule re-runs the availability check under a write lock.
 */
export const POST = handler({ auth: "supplier:manage" }, async (req, { user }) => {
  const d = await parseBody(req, manageSchema);
  const db = getDb();
  const spa = requireSupplierSpa(user!);
  const b = db.prepare("SELECT * FROM bookings WHERE ref = ? AND spa_id = ?").get(d.bookingRef, spa.id) as any;
  if (!b) throw new ApiError(404, "Booking not found.");

  const statusMap: Record<string, BookingStatus> = {
    confirm: "confirmed", start: "in_treatment", complete: "completed",
    cancel: "cancelled", no_show: "no_show",
  };

  if (d.action === "reschedule") {
    if (!d.date || !d.time) throw new ApiError(400, "New date and time are required.");
    const { slotIsFree } = await import("@/lib/availability");
    const check = slotIsFree({
      spaId: b.spa_id, branchId: b.branch_id, treatmentId: b.treatment_id,
      date: d.date, time: d.time, guests: b.guests, serviceType: b.service_type,
      therapistId: b.therapist_id,
    });
    if (!check.ok) throw new ApiError(409, check.reason || "Requested slot is not available.");
    db.transaction(() => {
      db.prepare("UPDATE bookings SET booking_date = ?, start_time = ?, updated_at = datetime('now') WHERE id = ?")
        .run(d.date, d.time, b.id);
      db.prepare("UPDATE booking_assignments SET booking_date = ?, start_time = ? WHERE booking_id = ?")
        .run(d.date, d.time, b.id);
      db.prepare(
        "INSERT INTO booking_events (booking_id, from_status, to_status, note, actor_id, actor_role) VALUES (?,?,?,?,?,?)"
      ).run(b.id, b.status, b.status, `Rescheduled ${b.booking_date} ${b.start_time} → ${d.date} ${d.time}${d.note ? ` — ${d.note}` : ""}`, user!.id, "supplier");
    }).immediate();
    notify(b.customer_id, "booking_changed", "Booking rescheduled",
      `Your booking ${b.ref} was moved to ${d.date} ${d.time}.`, `/dashboard/bookings/${b.ref}`);
    return { booking: db.prepare("SELECT * FROM bookings WHERE id = ?").get(b.id) };
  }

  if (d.action === "assign") {
    if (!d.therapistId) throw new ApiError(400, "therapistId is required.");
    const th = db.prepare("SELECT id FROM therapists WHERE id = ? AND spa_id = ?").get(d.therapistId, spa.id);
    if (!th) throw new ApiError(404, "Therapist not found.");
    const clash = db
      .prepare(
        `SELECT 1 FROM booking_assignments WHERE therapist_id = ? AND booking_date = ? AND start_time = ?
           AND booking_id != ? AND status IN ('pending','payment_pending','confirmed','voucher_issued','in_treatment')`
      )
      .get(d.therapistId, b.booking_date, b.start_time, b.id);
    if (clash) throw new ApiError(409, "That therapist already has a booking at this time.");
    db.prepare("UPDATE bookings SET therapist_id = ?, updated_at = datetime('now') WHERE id = ?").run(d.therapistId, b.id);
    db.prepare("UPDATE booking_assignments SET therapist_id = ? WHERE booking_id = ? AND guest_index = 0")
      .run(d.therapistId, b.id);
    db.prepare(
      "INSERT INTO booking_events (booking_id, from_status, to_status, note, actor_id, actor_role) VALUES (?,?,?,?,?,?)"
    ).run(b.id, b.status, b.status, `Therapist assigned${d.note ? ` — ${d.note}` : ""}`, user!.id, "supplier");
    return { booking: db.prepare("SELECT * FROM bookings WHERE id = ?").get(b.id) };
  }

  const updated = changeBookingStatus(b.id, statusMap[d.action], { id: user!.id, role: "supplier" }, d.note);
  return { booking: updated };
});
