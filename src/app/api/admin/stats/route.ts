import { handler } from "@/lib/api";
import { getDb } from "@/lib/db";
import { releaseExpiredHolds } from "@/lib/booking";

/** GET /api/admin/stats — platform overview for the admin dashboard. */
export const GET = handler({ auth: "admin:all" }, async () => {
  releaseExpiredHolds();
  const db = getDb();
  const one = (sql: string) => (db.prepare(sql).get() as any)?.c ?? 0;
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + "01";

  const revenue = db.prepare(
    `SELECT COALESCE(SUM(total),0) gross FROM bookings
      WHERE status IN ('confirmed','voucher_issued','in_treatment','completed')`
  ).get() as any;
  const commission = db.prepare(
    `SELECT COALESCE(SUM(amount),0) c FROM commissions WHERE status IN ('pending','settled')`
  ).get() as any;
  const refunds = db.prepare(
    `SELECT COALESCE(SUM(amount),0) c FROM refunds WHERE status = 'processed'`
  ).get() as any;

  return {
    customers: one(`SELECT COUNT(*) c FROM users WHERE role = 'customer'`),
    suppliersTotal: one(`SELECT COUNT(*) c FROM suppliers`),
    suppliersActive: one(`SELECT COUNT(*) c FROM suppliers WHERE status = 'approved'`),
    suppliersPending: one(`SELECT COUNT(*) c FROM suppliers WHERE status IN ('pending','changes_requested')`),
    spasPublished: one(`SELECT COUNT(*) c FROM spas WHERE status = 'published'`),
    bookingsTotal: one(`SELECT COUNT(*) c FROM bookings`),
    bookingsToday: one(`SELECT COUNT(*) c FROM bookings WHERE booking_date = '${today}'`),
    bookingsMonth: one(`SELECT COUNT(*) c FROM bookings WHERE booking_date >= '${monthStart}'`),
    revenueGross: revenue.gross,
    revenueMonth: (db.prepare(`SELECT COALESCE(SUM(total),0) c FROM bookings WHERE booking_date >= '${monthStart}' AND status IN ('confirmed','voucher_issued','in_treatment','completed')`).get() as any).c,
    commission: commission.c,
    refunds: refunds.c,
    cancellations: one(`SELECT COUNT(*) c FROM bookings WHERE status = 'cancelled'`),
    topSpas: db.prepare(
      `SELECT s.name, s.slug, COUNT(b.id) bookings, COALESCE(SUM(b.total),0) revenue
         FROM bookings b JOIN spas s ON s.id = b.spa_id
        WHERE b.status IN ('confirmed','voucher_issued','in_treatment','completed')
        GROUP BY s.id ORDER BY revenue DESC LIMIT 5`
    ).all(),
    topTreatments: db.prepare(
      `SELECT t.name, COUNT(b.id) bookings, COALESCE(SUM(b.total),0) revenue
         FROM bookings b JOIN treatments t ON t.id = b.treatment_id
        WHERE b.status IN ('confirmed','voucher_issued','in_treatment','completed')
        GROUP BY t.id ORDER BY bookings DESC LIMIT 5`
    ).all(),
    topDestinations: db.prepare(
      `SELECT COALESCE(s.city,'Unknown') city, COUNT(b.id) bookings
         FROM bookings b JOIN spas s ON s.id = b.spa_id
        WHERE b.status IN ('confirmed','voucher_issued','in_treatment','completed')
        GROUP BY s.city ORDER BY bookings DESC LIMIT 5`
    ).all(),
  };
});
