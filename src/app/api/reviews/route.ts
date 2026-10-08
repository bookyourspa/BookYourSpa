import { z } from "zod";
import { handler, parseBody, ApiError } from "@/lib/api";
import { getDb, tx } from "@/lib/db";
import { loadBooking } from "@/lib/booking-queries";
import { notify } from "@/lib/notify";

const reviewSchema = z.object({
  bookingRef: z.string().min(4),
  rating: z.number().int().min(1).max(5),
  body: z.string().max(2000).optional(),
  photos: z.array(z.string().max(500)).max(6).optional(),
});

/**
 * POST /api/reviews — only customers with a COMPLETED booking may review,
 * one review per booking. Supplier accounts cannot create reviews.
 */
export const POST = handler({ auth: "customer:book", rateLimit: "review" }, async (req, { user }) => {
  const d = await parseBody(req, reviewSchema);
  const db = getDb();
  const b = loadBooking(d.bookingRef, user!);
  if (b.customer_id !== user!.id) throw new ApiError(403, "You can only review your own bookings.");
  if (b.status !== "completed") throw new ApiError(409, "You can review a treatment after it is completed.");
  const existing = db.prepare("SELECT id FROM reviews WHERE booking_id = ?").get(b.id);
  if (existing) throw new ApiError(409, "You already reviewed this booking.");

  return tx(() => {
    db.prepare(
      `INSERT INTO reviews (booking_id, customer_id, spa_id, treatment_id, rating, body, photos)
       VALUES (?,?,?,?,?,?,?)`
    ).run(b.id, user!.id, b.spa_id, b.treatment_id, d.rating, d.body ?? null, JSON.stringify(d.photos ?? []));
    // Recompute spa rating
    db.prepare(
      `UPDATE spas SET
         rating_avg = (SELECT ROUND(AVG(rating), 1) FROM reviews
                        WHERE spa_id = spas.id AND status = 'published'),
         rating_count = (SELECT COUNT(*) FROM reviews
                          WHERE spa_id = spas.id AND status = 'published')
       WHERE id = ?`
    ).run(b.spa_id);
    const spa = db.prepare("SELECT supplier_id FROM spas WHERE id = ?").get(b.spa_id) as any;
    const supUser = db.prepare("SELECT user_id FROM suppliers WHERE id = ?").get(spa.supplier_id) as any;
    notify(supUser.user_id, "new_review", "New review received",
      `${d.rating}★ from ${b.customer_name}`, `/supplier`);
    return { created: true };
  });
});

/** GET /api/reviews?spaId=N — public reviews for a spa. */
export const GET = handler({ auth: "public" }, async (req) => {
  const db = getDb();
  const spaId = Number(new URL(req.url).searchParams.get("spaId"));
  if (!spaId) throw new ApiError(400, "spaId is required.");
  const reviews = db
    .prepare(
      `SELECT r.id, r.rating, r.body, r.photos, r.reply, r.created_at,
              u.full_name AS customer_name, t.name AS treatment_name, b.booking_date
         FROM reviews r
         JOIN users u ON u.id = r.customer_id
         JOIN bookings b ON b.id = r.booking_id
         LEFT JOIN treatments t ON t.id = r.treatment_id
        WHERE r.spa_id = ? AND r.status = 'published'
        ORDER BY r.created_at DESC LIMIT 50`
    )
    .all(spaId);
  return { reviews };
});
