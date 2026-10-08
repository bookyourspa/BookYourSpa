import { z } from "zod";
import { handler, parseBody, ApiError } from "@/lib/api";
import { getDb } from "@/lib/db";
import { requireSupplierSpa } from "@/lib/supplier";

/** GET /api/supplier/treatments — supplier's treatment catalog. */
export const GET = handler({ auth: "supplier:manage" }, async (_req, { user }) => {
  const db = getDb();
  const spa = requireSupplierSpa(user!);
  const treatments = db
    .prepare(
      `SELECT t.*, c.slug AS category_slug, c.name AS category_name,
              (SELECT COUNT(*) FROM therapist_treatments tt WHERE tt.treatment_id = t.id) AS therapist_count
         FROM treatments t LEFT JOIN treatment_categories c ON c.id = t.category_id
        WHERE t.spa_id = ? AND t.status != 'deleted' ORDER BY t.name`
    )
    .all(spa.id);
  const branches = db.prepare("SELECT id, name FROM branches WHERE spa_id = ?").all(spa.id);
  return { spa, treatments, branches };
});

const treatmentSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().min(2).max(160),
  categoryId: z.number().int().positive().nullable().optional(),
  description: z.string().max(3000).optional(),
  benefits: z.array(z.string().max(300)).optional(),
  durationMin: z.number().int().min(15).max(600),
  price: z.number().int().min(0),
  discount: z.number().int().min(0).max(90).default(0),
  currency: z.string().length(3).default("IDR"),
  minGuests: z.number().int().min(1).max(20).default(1),
  maxGuests: z.number().int().min(1).max(20).default(4),
  roomRequired: z.boolean().default(true),
  bufferMin: z.number().int().min(0).max(120).default(0),
  therapistGender: z.enum(["female", "male", "no_pref"]).default("no_pref"),
  homeService: z.boolean().default(false),
  travelFee: z.number().int().min(0).default(0),
  serviceRadiusKm: z.number().min(0).nullable().optional(),
  images: z.array(z.string().max(500)).optional(),
  branchIds: z.array(z.number().int()).optional(),
  status: z.enum(["active", "hidden"]).default("active"),
});

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

/** POST /api/supplier/treatments — create or update a treatment. */
export const POST = handler({ auth: "supplier:manage" }, async (req, { user }) => {
  const d = await parseBody(req, treatmentSchema);
  const db = getDb();
  const spa = requireSupplierSpa(user!);

  const payload = [
    d.name, d.categoryId ?? null, d.description ?? null, JSON.stringify(d.benefits ?? []),
    d.durationMin, d.price, d.discount, d.currency, d.minGuests, d.maxGuests,
    d.roomRequired ? 1 : 0, d.bufferMin, d.therapistGender, d.homeService ? 1 : 0,
    d.travelFee, d.serviceRadiusKm ?? null, JSON.stringify(d.images ?? []), d.status,
  ];

  let treatmentId = d.id;
  if (treatmentId) {
    const own = db.prepare("SELECT id FROM treatments WHERE id = ? AND spa_id = ?").get(treatmentId, spa.id);
    if (!own) throw new ApiError(404, "Treatment not found.");
    db.prepare(
      `UPDATE treatments SET name=?, category_id=?, description=?, benefits=?, duration_min=?, price=?,
        discount=?, currency=?, min_guests=?, max_guests=?, room_required=?, buffer_min=?,
        therapist_gender=?, home_service=?, travel_fee=?, service_radius_km=?, images=?, status=?,
        updated_at=datetime('now') WHERE id=?`
    ).run(...payload, treatmentId);
  } else {
    let slug = slugify(d.name);
    const clash = db.prepare("SELECT 1 FROM treatments WHERE spa_id = ? AND slug = ?").get(spa.id, slug);
    if (clash) slug = `${slug}-${Date.now().toString(36)}`;
    treatmentId = Number(
      db
        .prepare(
          `INSERT INTO treatments (spa_id, slug, name, category_id, description, benefits, duration_min,
             price, discount, currency, min_guests, max_guests, room_required, buffer_min,
             therapist_gender, home_service, travel_fee, service_radius_km, images, status)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        )
        .run(spa.id, slug, ...payload).lastInsertRowid
    );
  }

  if (d.branchIds) {
    db.prepare("DELETE FROM treatment_branches WHERE treatment_id = ?").run(treatmentId);
    const ins = db.prepare("INSERT OR IGNORE INTO treatment_branches (treatment_id, branch_id) VALUES (?,?)");
    for (const bid of d.branchIds) ins.run(treatmentId, bid);
  }
  return { treatmentId, status: d.status };
});

/** DELETE /api/supplier/treatments?id=N — soft-delete a treatment. */
export const DELETE = handler({ auth: "supplier:manage" }, async (req, { user }) => {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) throw new ApiError(400, "id is required.");
  const db = getDb();
  const spa = requireSupplierSpa(user!);
  const own = db.prepare("SELECT id FROM treatments WHERE id = ? AND spa_id = ?").get(id, spa.id);
  if (!own) throw new ApiError(404, "Treatment not found.");
  db.prepare("UPDATE treatments SET status = 'deleted' WHERE id = ?").run(id);
  return { deleted: true };
});
