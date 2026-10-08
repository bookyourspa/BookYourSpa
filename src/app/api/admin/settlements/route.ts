import { z } from "zod";
import { handler, parseBody, ApiError } from "@/lib/api";
import { getDb, tx } from "@/lib/db";

/** GET /api/admin/settlements — pending payouts per supplier + history. */
export const GET = handler({ auth: "admin:finance" }, async () => {
  const db = getDb();
  const suppliers = db
    .prepare(
      `SELECT sup.id, sup.business_name,
              COALESCE(SUM(c.gross),0) gross,
              COALESCE(SUM(c.amount),0) commission,
              COALESCE(SUM(c.net),0) net,
              SUM(CASE WHEN c.status='settled' THEN c.net ELSE 0 END) settled_net,
              (SELECT COALESCE(SUM(net),0) FROM settlements s WHERE s.supplier_id = sup.id AND s.status='paid') paid_out
         FROM suppliers sup LEFT JOIN commissions c ON c.supplier_id = sup.id
        GROUP BY sup.id ORDER BY sup.business_name`
    )
    .all() as any[];
  const rows = suppliers.map((s) => ({
    ...s,
    pendingPayout: Math.max(0, s.net - s.settled_net - s.paid_out),
  }));
  const history = db
    .prepare(`SELECT st.*, sup.business_name FROM settlements st JOIN suppliers sup ON sup.id = st.supplier_id ORDER BY st.created_at DESC LIMIT 50`)
    .all();
  return { suppliers: rows, history };
});

const payoutSchema = z.object({
  supplierId: z.number().int().positive(),
  note: z.string().max(300).optional(),
});

/**
 * POST /api/admin/settlements — mark a payout: settles all pending commissions
 * for the supplier and records a settlement row.
 */
export const POST = handler({ auth: "admin:finance" }, async (req, { user }) => {
  const d = await parseBody(req, payoutSchema);
  const db = getDb();
  const sup = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(d.supplierId) as any;
  if (!sup) throw new ApiError(404, "Supplier not found.");

  return tx(() => {
    const agg = db.prepare(
      `SELECT COALESCE(SUM(gross),0) gross, COALESCE(SUM(amount),0) commission, COALESCE(SUM(net),0) net
         FROM commissions WHERE supplier_id = ? AND status = 'pending'`
    ).get(d.supplierId) as any;
    if (!agg.net) throw new ApiError(400, "No pending payout for this supplier.");

    const refunds = db.prepare(
      `SELECT COALESCE(SUM(r.amount),0) c FROM refunds r JOIN bookings b ON b.id = r.booking_id
        JOIN spas s ON s.id = b.spa_id WHERE s.supplier_id = ? AND r.status='processed'`
    ).get(d.supplierId) as any;

    const sid = Number(
      db
        .prepare(
          `INSERT INTO settlements (supplier_id, period_start, period_end, gross, commission, refunds, net, status, paid_at, note)
           VALUES (?,?,?,?,?,?,?, 'paid', datetime('now'), ?)`
        )
        .run(
          d.supplierId,
          new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10),
          new Date().toISOString().slice(0, 10),
          agg.gross, agg.commission, refunds.c, agg.net - refunds.c, d.note ?? null
        ).lastInsertRowid
    );
    db.prepare(`UPDATE commissions SET status = 'settled', settled_at = datetime('now') WHERE supplier_id = ? AND status = 'pending'`).run(d.supplierId);
    db.prepare(
      "INSERT INTO audit_logs (user_id, actor_role, action, entity, entity_id, after) VALUES (?,?,?,?,?,?)"
    ).run(user!.id, `admin:${user!.admin_level}`, "settlement.paid", "settlement", String(sid), JSON.stringify({ supplierId: d.supplierId, net: agg.net }));
    return { settlementId: sid, amount: agg.net };
  });
});
