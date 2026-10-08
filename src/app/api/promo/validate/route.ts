import { z } from "zod";
import { handler, parseBody, ApiError } from "@/lib/api";
import { getDb } from "@/lib/db";
import { validatePromo } from "@/lib/booking";

const schema = z.object({
  code: z.string().min(3).max(40),
  spaId: z.number().int().positive(),
  treatmentId: z.number().int().positive(),
  subtotal: z.number().int().min(0),
});

/** POST /api/promo/validate — preview promo discount for the price summary. */
export const POST = handler({ auth: "public", rateLimit: "promo" }, async (req, { user }) => {
  const d = await parseBody(req, schema);
  const treatment = getDb().prepare("SELECT * FROM treatments WHERE id = ? AND spa_id = ?").get(d.treatmentId, d.spaId) as any;
  if (!treatment) throw new ApiError(404, "Treatment not found.");
  try {
    const p = validatePromo(d.code, treatment, d.subtotal, user?.id ?? -1);
    const discount = p.kind === "percent" ? Math.round((d.subtotal * p.value) / 100) : Math.min(p.value, d.subtotal);
    return { promo: { code: p.code, kind: p.kind, value: p.value, discount } };
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(400, "Invalid promo code.");
  }
});
