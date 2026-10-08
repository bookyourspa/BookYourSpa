import { getDb } from "./db";
import { ApiError } from "./api";
import { SessionUser } from "./auth";

/**
 * Loads a booking by ref and enforces ownership: the customer who booked,
 * a supplier of the spa, or an admin may read it.
 */
export function loadBooking(ref: string, user: SessionUser) {
  const db = getDb();
  const b = db.prepare("SELECT * FROM bookings WHERE ref = ?").get(ref) as any;
  if (!b) throw new ApiError(404, "Booking not found.");
  if (b.customer_id === user.id || user.role === "admin") return b;
  if (user.role === "supplier" && user.supplier_id) {
    const spa = db.prepare("SELECT supplier_id FROM spas WHERE id = ?").get(b.spa_id) as any;
    if (spa?.supplier_id === user.supplier_id) return b;
  }
  throw new ApiError(403, "Not your booking.");
}
