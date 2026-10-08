import { handler } from "@/lib/api";
import { getDb } from "@/lib/db";
import { requireSupplierSpa } from "@/lib/supplier";
import { releaseExpiredHolds } from "@/lib/booking";

/**
 * GET /api/supplier/stats — dashboard overview:
 * today's bookings, upcoming, pending, revenue (today/month),
 * completed, cancelled, no-shows, occupancy, therapist utilization.
 */
export const GET = handler({ auth: "supplier:manage" }, async (_req, { user }) => {
  releaseExpiredHolds();
  const db = getDb();
  const spa = requireSupplierSpa(user!);
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + "01";

  const one = (sql: string, ...params: any[]) => (db.prepare(sql).get(...params) as any)?.c ?? 0;
  const activeStatuses = "('pending','payment_pending','confirmed','voucher_issued','in_treatment')";

  const stats = {
    todayBookings: one(`SELECT COUNT(*) c FROM bookings WHERE spa_id = ? AND booking_date = ? AND status IN ${activeStatuses}`, spa.id, today),
    upcoming: one(`SELECT COUNT(*) c FROM bookings WHERE spa_id = ? AND booking_date >= ? AND status IN ('confirmed','voucher_issued','pending')`, spa.id, today),
    pending: one(`SELECT COUNT(*) c FROM bookings WHERE spa_id = ? AND status IN ('pending','payment_pending')`, spa.id),
    todayRevenue: (db.prepare(`SELECT COALESCE(SUM(total),0) c FROM bookings WHERE spa_id = ? AND booking_date = ? AND status IN ('confirmed','voucher_issued','in_treatment','completed')`).get(spa.id, today) as any).c,
    monthRevenue: (db.prepare(`SELECT COALESCE(SUM(total),0) c FROM bookings WHERE spa_id = ? AND booking_date >= ? AND status IN ('confirmed','voucher_issued','in_treatment','completed')`).get(spa.id, monthStart) as any).c,
    completed: one(`SELECT COUNT(*) c FROM bookings WHERE spa_id = ? AND status = 'completed'`, spa.id),
    cancelled: one(`SELECT COUNT(*) c FROM bookings WHERE spa_id = ? AND status = 'cancelled'`, spa.id),
    noShows: one(`SELECT COUNT(*) c FROM bookings WHERE spa_id = ? AND status = 'no_show'`, spa.id),
    monthBookings: one(`SELECT COUNT(*) c FROM bookings WHERE spa_id = ? AND booking_date >= ?`, spa.id, monthStart),
  };

  // Commission view
  const comm = db.prepare(
    `SELECT COALESCE(SUM(gross),0) gross, COALESCE(SUM(amount),0) commission, COALESCE(SUM(net),0) net
       FROM commissions WHERE supplier_id = ?`
  ).get(spa.supplier_id) as any;
  const paidOut = (db.prepare(`SELECT COALESCE(SUM(net),0) c FROM settlements WHERE supplier_id = ? AND status = 'paid'`).get(spa.supplier_id) as any).c;
  const settledCommissions = (db.prepare(`SELECT COALESCE(SUM(amount),0) c FROM commissions WHERE supplier_id = ? AND status = 'settled'`).get(spa.supplier_id) as any).c;

  // Therapist utilization today: busy therapists / active therapists
  const therapists = db.prepare(`SELECT id FROM therapists WHERE spa_id = ? AND status = 'active'`).all(spa.id) as any[];
  const busy = one(
    `SELECT COUNT(DISTINCT therapist_id) c FROM bookings WHERE spa_id = ? AND booking_date = ? AND status IN ${activeStatuses} AND therapist_id IS NOT NULL`,
    spa.id, today
  );
  const rooms = one(`SELECT COUNT(*) c FROM rooms r JOIN branches b ON b.id = r.branch_id WHERE b.spa_id = ? AND r.status='active'`, spa.id);
  const roomsBusy = one(
    `SELECT COUNT(DISTINCT room_id) c FROM bookings WHERE spa_id = ? AND booking_date = ? AND status IN ${activeStatuses} AND room_id IS NOT NULL`,
    spa.id, today
  );

  return {
    stats,
    finance: {
      gross: comm.gross,
      commission: comm.commission,
      net: comm.net,
      pendingPayout: Math.max(0, comm.net - settledCommissions - paidOut),
      paid: paidOut + settledCommissions,
    },
    utilization: {
      therapistTotal: therapists.length,
      therapistBusyToday: busy,
      roomTotal: rooms,
      roomBusyToday: roomsBusy,
      occupancyPct: rooms ? Math.round((roomsBusy / rooms) * 100) : 0,
    },
  };
});
