import { z } from "zod";
import { handler, parseBody, ApiError } from "@/lib/api";
import { getDb } from "@/lib/db";
import { verifyPassword, createSession, setSessionCookie } from "@/lib/auth";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const POST = handler({ auth: "public", rateLimit: "login" }, async (req) => {
  const data = await parseBody(req, loginSchema);
  const db = getDb();
  const user = db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").get(data.email) as any;

  if (!user) throw new ApiError(401, "Invalid email or password.");
  if (user.status === "suspended") throw new ApiError(403, "This account has been suspended. Contact support.");
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    throw new ApiError(423, "Account temporarily locked due to failed login attempts.");
  }

  if (!verifyPassword(data.password, user.password_hash)) {
    const fails = user.failed_logins + 1;
    const lock = fails >= 5 ? new Date(Date.now() + 15 * 60_000).toISOString() : null;
    db.prepare("UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?").run(fails, lock, user.id);
    throw new ApiError(401, "Invalid email or password.");
  }

  db.prepare("UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = datetime('now') WHERE id = ?").run(user.id);
  const token = await createSession(user.id, req.headers.get("x-forwarded-for") ?? undefined, req.headers.get("user-agent") ?? undefined);
  await setSessionCookie(token);
  return { id: user.id, email: user.email, fullName: user.full_name, role: user.role, adminLevel: user.admin_level };
});
