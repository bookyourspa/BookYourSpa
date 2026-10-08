import { handler, ApiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

/** GET /api/auth/me — current session user (used by the header/clients). */
export const GET = handler({ auth: "public" }, async () => {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, "Not authenticated.");
  return { user };
});
