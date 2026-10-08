import { z } from "zod";
import { handler } from "@/lib/api";
import { getDb } from "@/lib/db";
import { releaseExpiredHolds } from "@/lib/booking";

const querySchema = z.object({
  q: z.string().optional(),
  location: z.string().optional(),
  category: z.string().optional(),
  spaType: z.string().optional(),
  serviceType: z.enum(["in_spa", "doorstep"]).optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  minRating: z.coerce.number().optional(),
  duration: z.coerce.number().optional(),
  sort: z.enum(["recommended", "rating", "price_asc", "price_desc", "popular", "newest"]).default("recommended"),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(12),
});

/**
 * Marketplace search: full-text-ish matching over spa names, cities, areas and
 * treatments with filters + sorting. Returns published spas only.
 */
export const GET = handler({ auth: "public", rateLimit: "search" }, async (req) => {
  releaseExpiredHolds();
  const url = new URL(req.url);
  const q = querySchema.parse(Object.fromEntries(url.searchParams));
  const db = getDb();

  const where: string[] = ["s.status = 'published'", "sup.status = 'approved'"];
  const params: any[] = [];

  if (q.q) {
    where.push(`(s.name LIKE ? OR s.city LIKE ? OR s.address LIKE ? OR s.description LIKE ?
       OR EXISTS (SELECT 1 FROM treatments t WHERE t.spa_id = s.id AND t.status='active' AND t.name LIKE ?))`);
    const like = `%${q.q}%`;
    params.push(like, like, like, like, like);
  }
  if (q.location) {
    where.push(`(s.city LIKE ? OR s.address LIKE ? OR EXISTS (
       SELECT 1 FROM locations l WHERE l.id = s.location_id AND l.slug = ?))`);
    params.push(`%${q.location}%`, `%${q.location}%`, q.location);
  }
  if (q.category) {
    where.push(`EXISTS (SELECT 1 FROM treatments t WHERE t.spa_id = s.id AND t.status='active'
       AND t.category_id = (SELECT id FROM treatment_categories WHERE slug = ?))`);
    params.push(q.category);
  }
  if (q.spaType) {
    where.push(`s.spa_types LIKE ?`);
    params.push(`%${q.spaType}%`);
  }
  if (q.serviceType === "doorstep") {
    where.push(`EXISTS (SELECT 1 FROM treatments t WHERE t.spa_id = s.id AND t.status='active' AND t.home_service = 1)`);
  } else if (q.serviceType === "in_spa") {
    where.push(`EXISTS (SELECT 1 FROM branches b WHERE b.spa_id = s.id AND b.status='active')`);
  }
  if (q.minRating) {
    where.push("s.rating_avg >= ?");
    params.push(q.minRating);
  }
  if (q.minPrice !== undefined || q.maxPrice !== undefined) {
    const priceClause = `EXISTS (SELECT 1 FROM treatments t WHERE t.spa_id = s.id AND t.status='active'`;
    const p2: any[] = [];
    let clause = priceClause;
    if (q.minPrice !== undefined) { clause += " AND t.price >= ?"; p2.push(q.minPrice); }
    if (q.maxPrice !== undefined) { clause += " AND t.price <= ?"; p2.push(q.maxPrice); }
    clause += ")";
    where.push(clause);
    params.push(...p2);
  }
  if (q.duration) {
    where.push(`EXISTS (SELECT 1 FROM treatments t WHERE t.spa_id = s.id AND t.status='active' AND t.duration_min = ?)`);
    params.push(q.duration);
  }

  const orderBy: Record<string, string> = {
    recommended: "s.is_featured DESC, s.rating_avg DESC, s.rating_count DESC",
    rating: "s.rating_avg DESC, s.rating_count DESC",
    price_asc: "(SELECT MIN(t.price) FROM treatments t WHERE t.spa_id = s.id AND t.status='active') ASC",
    price_desc: "(SELECT MAX(t.price) FROM treatments t WHERE t.spa_id = s.id AND t.status='active') DESC",
    popular: "s.rating_count DESC, s.rating_avg DESC",
    newest: "s.created_at DESC",
  };

  const whereSql = where.join(" AND ");
  const total = (
    db.prepare(`SELECT COUNT(*) c FROM spas s JOIN suppliers sup ON sup.id = s.supplier_id WHERE ${whereSql}`).get(...params) as any
  ).c;

  const rows = db
    .prepare(
      `SELECT s.id, s.slug, s.name, s.city, s.country, s.address, s.cover_url, s.logo_url,
              s.rating_avg, s.rating_count, s.is_featured, s.spa_types,
              (SELECT MIN(t.price) FROM treatments t WHERE t.spa_id = s.id AND t.status='active') AS price_from,
              (SELECT MIN(t.currency) FROM treatments t WHERE t.spa_id = s.id AND t.status='active') AS currency,
              (SELECT COUNT(*) FROM treatments t WHERE t.spa_id = s.id AND t.status='active') AS treatment_count
         FROM spas s JOIN suppliers sup ON sup.id = s.supplier_id
        WHERE ${whereSql}
        ORDER BY ${orderBy[q.sort]}
        LIMIT ? OFFSET ?`
    )
    .all(...params, q.limit, (q.page - 1) * q.limit);

  return { spas: rows, total, page: q.page, pages: Math.ceil(total / q.limit) };
});
