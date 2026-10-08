import { z } from "zod";
import { handler } from "@/lib/api";
import { computeAvailability } from "@/lib/availability";
import { releaseExpiredHolds } from "@/lib/booking";

const querySchema = z.object({
  spaId: z.coerce.number().int().positive(),
  branchId: z.coerce.number().int().positive(),
  treatmentId: z.coerce.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  guests: z.coerce.number().int().min(1).max(20).default(1),
  serviceType: z.enum(["in_spa", "doorstep"]).default("in_spa"),
  therapistId: z.coerce.number().int().positive().optional(),
});

/**
 * Live availability: returns genuinely open slots for the exact
 * spa+branch+treatment+date+guests combination plus the therapist
 * availability column (name + status only).
 */
export const GET = handler({ auth: "public", rateLimit: "availability" }, async (req) => {
  releaseExpiredHolds();
  const url = new URL(req.url);
  const q = querySchema.parse(Object.fromEntries(url.searchParams));
  const result = computeAvailability({
    spaId: q.spaId,
    branchId: q.branchId,
    treatmentId: q.treatmentId,
    date: q.date,
    guests: q.guests,
    serviceType: q.serviceType,
    therapistId: q.therapistId ?? null,
  });
  return result;
});
