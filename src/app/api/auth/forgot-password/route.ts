import { z } from "zod";
import { handler, parseBody, ApiError } from "@/lib/api";
import { getDb } from "@/lib/db";
import { sha256, hashPassword } from "@/lib/auth";
import { createPasswordReset, sendEmail } from "@/lib/notify";

/** Request a reset link (always returns ok — never reveals whether email exists). */
export const POST = handler({ auth: "public", rateLimit: "forgot" }, async (req) => {
  const { email } = await parseBody(req, z.object({ email: z.string().email() }));
  const db = getDb();
  const user = db.prepare("SELECT id, full_name FROM users WHERE email = ? COLLATE NOCASE").get(email) as any;
  if (user) {
    const token = createPasswordReset(user.id);
    sendEmail("password_reset", email, {
      name: user.full_name,
      link: `${process.env.APP_URL || "http://localhost:3000"}/reset-password?token=${token}`,
    });
  }
  return { sent: true };
});

/** Consume a reset token and set the new password. */
export const PATCH = handler({ auth: "public", rateLimit: "reset" }, async (req) => {
  const { token, password } = await parseBody(
    req,
    z.object({ token: z.string().min(10), password: z.string().min(8).max(200) })
  );
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM password_resets WHERE token_hash = ? AND used = 0")
    .get(sha256(token)) as any;
  if (!row || new Date(row.expires_at) < new Date()) throw new ApiError(400, "This reset link is invalid or expired.");
  db.prepare("UPDATE users SET password_hash = ?, failed_logins = 0, locked_until = NULL WHERE id = ?").run(
    hashPassword(password),
    row.user_id
  );
  db.prepare("UPDATE password_resets SET used = 1 WHERE id = ?").run(row.id);
  db.prepare("UPDATE auth_sessions SET revoked = 1 WHERE user_id = ?").run(row.user_id);
  return { reset: true };
});
