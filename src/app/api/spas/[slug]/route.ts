import { handler, ApiError } from "@/lib/api";
import { getDb } from "@/lib/db";
import { releaseExpiredHolds } from "@/lib/booking";

/**
 * GET /api/spas/[slug] — full public spa profile: branches, treatments,
 * therapists, reviews. Only published spas + approved suppliers visible.
 */
export const GET = handler({ auth: "public" }, async (_req, { params }) => {
  releaseExpiredHolds();
  const db = getDb();
  const spa = db
    .prepare(
      `SELECT s.*, sup.business_name, sup.status AS supplier_status
         FROM spas s JOIN suppliers sup ON sup.id = s.supplier_id
        WHERE s.slug = ? AND s.status = 'published' AND sup.status = 'approved'`
    )
    .get(params.slug) as any;
  if (!spa) throw new ApiError(404, "Spa not found.");

  const branches = db.prepare("SELECT * FROM branches WHERE spa_id = ? AND status = 'active'").all(spa.id);
  const treatments = db
    .prepare(
      `SELECT t.*, c.name AS category_name, c.slug AS category_slug,
              (SELECT COUNT(*) FROM therapist_treatments tt WHERE tt.treatment_id = t.id) AS qualified_therapists
         FROM treatments t LEFT JOIN treatment_categories c ON c.id = t.category_id
        WHERE t.spa_id = ? AND t.status = 'active' ORDER BY t.price`
    )
    .all(spa.id);
  const therapists = db
    .prepare(
      `SELECT id, name, gender, photo_url, specialty, skills, languages, status
         FROM therapists WHERE spa_id = ? AND status = 'active' ORDER BY name`
    )
    .all(spa.id);
  const reviews = db
    .prepare(
      `SELECT r.id, r.rating, r.body, r.reply, r.created_at, u.full_name AS customer_name,
              t.name AS treatment_name
         FROM reviews r JOIN users u ON u.id = r.customer_id
         LEFT JOIN treatments t ON t.id = r.treatment_id
        WHERE r.spa_id = ? AND r.status = 'published' ORDER BY r.created_at DESC LIMIT 20`
    )
    .all(spa.id);

  return {
    spa: { ...spa, opening_hours: spa.opening_hours ? JSON.parse(spa.opening_hours) : null,
      facilities: JSON.parse(spa.facilities || "[]"), languages: JSON.parse(spa.languages || "[]"),
      spa_types: JSON.parse(spa.spa_types || "[]"), gallery: JSON.parse(spa.gallery || "[]") },
    branches, treatments, therapists, reviews,
  };
});
