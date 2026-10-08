import { handler } from "@/lib/api";
import { getDb } from "@/lib/db";

/** GET /api/admin/audit — recent audit log entries (who changed what, when). */
export const GET = handler({ auth: "admin:all" }, async (req) => {
  const db = getDb();
  const url = new URL(req.url);
  const limit = Math.min(200, Number(url.searchParams.get("limit") || 50));
  const entity = url.searchParams.get("entity");
  const rows = db
    .prepare(
      `SELECT a.*, u.email AS user_email, u.full_name AS user_name
         FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
        ${entity ? "WHERE a.entity = ?" : ""}
        ORDER BY a.created_at DESC LIMIT ?`
    )
    .all(...(entity ? [entity, limit] : [limit]));
  return { logs: rows };
});
