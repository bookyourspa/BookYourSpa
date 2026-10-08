import { z } from "zod";
import { handler, parseBody, ApiError } from "@/lib/api";
import { getDb, tx } from "@/lib/db";
import { notify, notifyChannel } from "@/lib/notify";

/** GET /api/admin/suppliers — all suppliers with review status. */
export const GET = handler({ auth: "admin:suppliers" }, async (req) => {
  const db = getDb();
  const status = new URL(req.url).searchParams.get("status");
  const rows = db
    .prepare(
      `SELECT sup.*, u.email, u.full_name, u.phone,
              (SELECT COUNT(*) FROM spas s WHERE s.supplier_id = sup.id) AS spa_count
         FROM suppliers sup JOIN users u ON u.id = sup.user_id
        ${status ? "WHERE sup.status = ?" : ""}
        ORDER BY sup.created_at DESC`
    )
    .all(...(status ? [status] : []));
  return { suppliers: rows };
});

const decisionSchema = z.object({
  supplierId: z.number().int().positive(),
  action: z.enum(["approve", "reject", "request_changes", "suspend", "reactivate", "unpublish"]),
  reason: z.string().max(500).optional(),
});

const STATUS_FOR: Record<string, string> = {
  approve: "approved",
  reject: "rejected",
  request_changes: "changes_requested",
  suspend: "suspended",
  reactivate: "approved",
  unpublish: "unpublished",
};

/**
 * POST /api/admin/suppliers — supplier approval workflow.
 * A spa only becomes publicly visible after `approve` (spas.status → published).
 */
export const POST = handler({ auth: "admin:suppliers" }, async (req, { user }) => {
  const d = await parseBody(req, decisionSchema);
  const db = getDb();
  const sup = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(d.supplierId) as any;
  if (!sup) throw new ApiError(404, "Supplier not found.");

  tx(() => {
    db.prepare(
      `UPDATE suppliers SET status = ?, status_reason = ?, reviewed_at = datetime('now'), reviewed_by = ?,
        updated_at = datetime('now') WHERE id = ?`
    ).run(STATUS_FOR[d.action], d.reason ?? null, user!.id, d.supplierId);

    // Mirror visibility onto spa records
    const spaStatus = d.action === "approve" ? "published"
      : d.action === "reactivate" ? "published"
      : d.action === "suspend" ? "suspended"
      : d.action === "unpublish" ? "unpublished"
      : null;
    if (spaStatus) {
      db.prepare("UPDATE spas SET status = ?, updated_at = datetime('now') WHERE supplier_id = ? AND status != 'draft'")
        .run(spaStatus, d.supplierId);
    }

    db.prepare(
      "INSERT INTO audit_logs (user_id, actor_role, action, entity, entity_id, before, after) VALUES (?,?,?,?,?,?,?)"
    ).run(user!.id, `admin:${user!.admin_level}`, `supplier.${d.action}`, "supplier", String(d.supplierId),
      JSON.stringify({ status: sup.status }), JSON.stringify({ status: STATUS_FOR[d.action], reason: d.reason ?? null }));
  });

  const supUser = db.prepare("SELECT user_id FROM suppliers WHERE id = ?").get(d.supplierId) as any;
  if (d.action === "approve" || d.action === "reactivate") {
    notifyChannel(supUser.user_id, "supplier_approved", { business: sup.business_name, name: sup.business_name }, ["email"]);
    notify(supUser.user_id, "supplier_approved", "Your spa is approved", `${sup.business_name} is now live on Book Your Spa.`, "/supplier");
  } else {
    notify(supUser.user_id, "supplier_status", `Application ${STATUS_FOR[d.action].replace("_", " ")}`,
      d.reason || `Your application status changed to ${STATUS_FOR[d.action]}.`, "/supplier");
  }
  return { supplier: db.prepare("SELECT * FROM suppliers WHERE id = ?").get(d.supplierId) };
});
