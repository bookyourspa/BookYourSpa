import { z } from "zod";
import { handler, parseBody, ApiError } from "@/lib/api";
import { getDb, tx } from "@/lib/db";
import { hashPassword, createSession, setSessionCookie } from "@/lib/auth";
import { sendEmail, notify } from "@/lib/notify";

const schema = z.object({
  businessName: z.string().min(2).max(160),
  description: z.string().max(3000).optional(),
  email: z.string().email(),
  password: z.string().min(8).max(200),
  fullName: z.string().min(2).max(120),
  phone: z.string().max(30).optional(),
  whatsapp: z.string().max(30).optional(),
  country: z.string().max(60).default("Indonesia"),
  website: z.string().max(200).optional(),
});

/**
 * POST /api/supplier/register — creates the supplier user + business profile.
 * The business starts as `pending` and is NOT publicly visible until an
 * admin approves it (see /api/admin/suppliers).
 */
export const POST = handler({ auth: "public", rateLimit: "supplier-register" }, async (req) => {
  const data = await parseBody(req, schema);
  const db = getDb();
  if (db.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE").get(data.email)) {
    throw new ApiError(409, "An account with this email already exists.");
  }

  const result = tx(() => {
    const userId = Number(
      db
        .prepare(
          `INSERT INTO users (email, password_hash, role, full_name, phone, whatsapp, country)
           VALUES (?,?, 'supplier', ?,?,?,?)`
        )
        .run(data.email, hashPassword(data.password), data.fullName, data.phone ?? null, data.whatsapp ?? null, data.country)
        .lastInsertRowid
    );
    const supplierId = Number(
      db
        .prepare(
          `INSERT INTO suppliers (user_id, business_name, description, website, whatsapp, country, status, submitted_at)
           VALUES (?,?,?,?,?,?, 'pending', datetime('now'))`
        )
        .run(userId, data.businessName, data.description ?? null, data.website ?? null, data.whatsapp ?? data.phone ?? null, data.country)
        .lastInsertRowid
    );
    return { userId, supplierId };
  });

  sendEmail("supplier_registration", data.email, { name: data.fullName, business: data.businessName });
  notify(result.userId, "supplier_registration", "Application received",
    `Your application for ${data.businessName} is under admin review.`, "/supplier");

  const token = await createSession(result.userId);
  await setSessionCookie(token);
  return { supplierId: result.supplierId, status: "pending" };
});
