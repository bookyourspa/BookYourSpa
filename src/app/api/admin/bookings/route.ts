import { z } from "zod";
import { handler, parseBody, ApiError } from "@/lib/api";
import { getDb } from "@/lib/db";
import { changeBookingStatus, BookingStatus } from "@/lib/booking";
import { requestRefund } from "@/lib/payments";

/** GET /api/admin/bookings — platform-wide booking list with filters. */
export const GET = handler({ auth: "admin:support" }, async (req) => {
  const db = getDb();
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const q = url.searchParams.get("q");
  const where: string[] = ["1=1"];
  const params: any[] = [];
  if (status) { where.push("b.status = ?"); params.push(status); }
  if (q) { where.push("(b.ref LIKE ? OR b.customer_name LIKE ? OR b.customer_email LIKE ?)"); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const bookings = db
    .prepare(
      `SELECT b.*, s.name spa_name, t.name treatment_name, p.status payment_status, p.method payment_method
         FROM bookings b JOIN spas s ON s.id = b.spa_id JOIN treatments t ON t.id = b.treatment_id
         LEFT JOIN payments p ON p.id = (SELECT MAX(id) FROM payments WHERE booking_id = b.id)
        WHERE ${where.join(" AND ")} ORDER BY b.created_at DESC LIMIT 200`
    )
    .all(...params);
  return { bookings };
});

const actionSchema = z.object({
  bookingRef: z.string().min(4),
  action: z.enum(["confirm", "cancel", "complete", "no_show", "refund", "pending"]),
  amount: z.number().int().positive().optional(),
  reason: z.string().max(500).optional(),
});

/** POST /api/admin/bookings — admin booking actions incl. refunds. */
export const POST = handler({ auth: "admin:finance" }, async (req, { user }) => {
  const d = await parseBody(req, actionSchema);
  const db = getDb();
  const b = db.prepare("SELECT * FROM bookings WHERE ref = ?").get(d.bookingRef) as any;
  if (!b) throw new ApiError(404, "Booking not found.");

  if (d.action === "refund") {
    const payment = db.prepare("SELECT amount FROM payments WHERE booking_id = ? AND status = 'paid' ORDER BY id DESC LIMIT 1").get(b.id) as any;
    if (!payment) throw new ApiError(400, "No captured payment to refund.");
    const amount = d.amount ?? payment.amount;
    const result = await requestRefund(b.id, amount, d.reason || "Admin refund", user!.id);
    db.prepare("INSERT INTO audit_logs (user_id, actor_role, action, entity, entity_id, after) VALUES (?,?,?,?,?,?)")
      .run(user!.id, `admin:${user!.admin_level}`, "payment.refund", "booking", b.ref, JSON.stringify({ amount, reason: d.reason }));
    return { payment: result };
  }

  const map: Record<string, BookingStatus> = {
    confirm: "confirmed", cancel: "cancelled", complete: "completed", no_show: "no_show", pending: "payment_pending",
  };
  const updated = changeBookingStatus(b.id, map[d.action], { id: user!.id, role: "admin" }, d.reason || `Admin action: ${d.action}`);
  db.prepare("INSERT INTO audit_logs (user_id, actor_role, action, entity, entity_id, before, after) VALUES (?,?,?,?,?,?,?)")
    .run(user!.id, `admin:${user!.admin_level}`, `booking.${d.action}`, "booking", b.ref,
      JSON.stringify({ status: b.status }), JSON.stringify({ status: updated.status }));
  return { booking: updated };
});
