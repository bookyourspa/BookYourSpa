import { z } from "zod";
import { handler, parseBody, ApiError } from "@/lib/api";
import { getDb } from "@/lib/db";
import { createBooking, releaseExpiredHolds, quotePrice } from "@/lib/booking";

const createSchema = z.object({
  spaId: z.number().int().positive(),
  branchId: z.number().int().positive(),
  treatmentId: z.number().int().positive(),
  therapistPreference: z.enum(["any", "specific"]).default("any"),
  therapistId: z.number().int().positive().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  guests: z.number().int().min(1).max(20).default(1),
  serviceType: z.enum(["in_spa", "doorstep"]).default("in_spa"),
  customer: z.object({
    name: z.string().min(2).max(120),
    email: z.string().email(),
    phone: z.string().max(30).optional(),
    whatsapp: z.string().max(30).optional(),
    country: z.string().max(60).optional(),
    specialRequest: z.string().max(1000).optional(),
  }),
  address: z.string().max(300).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  promoCode: z.string().max(40).optional(),
});

/** POST /api/bookings — creates a booking under an IMMEDIATE write lock (double-booking safe). */
export const POST = handler({ auth: "customer:book", rateLimit: "booking" }, async (req, { user }) => {
  const data = await parseBody(req, createSchema);
  if (data.serviceType === "doorstep" && !data.address) {
    throw new ApiError(400, "An address is required for doorstep service.");
  }
  const booking = createBooking({ customerId: user!.id, ...data });
  return { booking };
});

/** GET /api/bookings — the signed-in customer's bookings. */
export const GET = handler({ auth: "customer:book" }, async (_req, { user }) => {
  releaseExpiredHolds();
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT b.*, s.name AS spa_name, s.slug AS spa_slug, s.city, s.cover_url,
              t.name AS treatment_name, t.duration_min AS treatment_duration,
              th.name AS therapist_name, br.name AS branch_name
         FROM bookings b
         JOIN spas s ON s.id = b.spa_id
         JOIN treatments t ON t.id = b.treatment_id
         LEFT JOIN therapists th ON th.id = b.therapist_id
         LEFT JOIN branches br ON br.id = b.branch_id
        WHERE b.customer_id = ?
        ORDER BY b.booking_date DESC, b.start_time DESC`
    )
    .all(user!.id);
  return { bookings: rows };
});
