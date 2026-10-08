import { z } from "zod";
import { handler, parseBody, ApiError } from "@/lib/api";
import { getDb } from "@/lib/db";
import { hashPassword, createSession, setSessionCookie } from "@/lib/auth";
import { sendEmail, notify } from "@/lib/notify";

const registerSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  fullName: z.string().min(2, "Name is required").max(120),
  phone: z.string().max(30).optional(),
  whatsapp: z.string().max(30).optional(),
  country: z.string().max(60).optional(),
});

export const POST = handler({ auth: "public", rateLimit: "register" }, async (req) => {
  const data = await parseBody(req, registerSchema);
  const db = getDb();
  const existing = db.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE").get(data.email);
  if (existing) throw new ApiError(409, "An account with this email already exists.");

  const info = db
    .prepare(
      `INSERT INTO users (email, password_hash, role, full_name, phone, whatsapp, country)
       VALUES (?,?, 'customer', ?,?,?,?)`
    )
    .run(data.email, hashPassword(data.password), data.fullName, data.phone ?? null, data.whatsapp ?? null, data.country ?? null);
  const userId = Number(info.lastInsertRowid);

  sendEmail("welcome", data.email, { name: data.fullName });
  notify(userId, "welcome", "Welcome to Book Your Spa", "Discover, compare and book the world's best spas.", "/explore");

  const token = await createSession(userId, req.headers.get("x-forwarded-for") ?? undefined, req.headers.get("user-agent") ?? undefined);
  await setSessionCookie(token);
  return { id: userId, email: data.email, fullName: data.fullName, role: "customer" };
});
