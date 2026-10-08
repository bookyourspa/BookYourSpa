import { getDb } from "./db";
import { ApiError } from "./api";
import { SessionUser } from "./auth";

/** Resolve the spa the signed-in supplier manages. */
export function requireSupplierSpa(user: SessionUser): any {
  if (!user.supplier_id) throw new ApiError(403, "Supplier account required.");
  const db = getDb();
  const spa = db.prepare("SELECT * FROM spas WHERE supplier_id = ? ORDER BY id LIMIT 1").get(user.supplier_id) as any;
  if (!spa) throw new ApiError(400, "Create your spa profile first.");
  return spa;
}
