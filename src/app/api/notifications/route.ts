import { handler } from "@/lib/api";
import { getDb } from "@/lib/db";

/** GET /api/notifications — in-platform notifications for the signed-in user. */
export const GET = handler({ auth: "none" }, async (_req, { user }) => {
  if (!user) return { notifications: [], unread: 0 };
  const db = getDb();
  const notifications = db
    .prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50")
    .all(user.id);
  const unread = (db.prepare("SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND read_at IS NULL").get(user.id) as any).c;
  return { notifications, unread };
});

/** POST /api/notifications — mark all as read. */
export const POST = handler({ auth: "none" }, async (_req, { user }) => {
  if (!user) return { ok: false };
  getDb().prepare("UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL").run(user.id);
  return { ok: true };
});
