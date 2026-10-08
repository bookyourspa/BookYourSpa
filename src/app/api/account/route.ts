import { z } from "zod";
import { handler, parseBody } from "@/lib/api";
import { getDb } from "@/lib/db";

const schema = z.object({
  fullName: z.string().min(2).max(120).optional(),
  phone: z.string().max(30).optional(),
  whatsapp: z.string().max(30).optional(),
  country: z.string().max(60).optional(),
});

/** PATCH /api/account — update the signed-in user's profile. */
export const PATCH = handler({ auth: "none" }, async (req, { user }) => {
  if (!user) return { ok: false };
  const d = await parseBody(req, schema);
  getDb()
    .prepare(
      `UPDATE users SET full_name = COALESCE(?, full_name), phone = COALESCE(?, phone),
         whatsapp = COALESCE(?, whatsapp), country = COALESCE(?, country),
         updated_at = datetime('now') WHERE id = ?`
    )
    .run(d.fullName ?? null, d.phone ?? null, d.whatsapp ?? null, d.country ?? null, user.id);
  return { updated: true };
});
