import { handler, ApiError } from "@/lib/api";
import { destroySession, clearSessionCookie, getCurrentUser } from "@/lib/auth";

export const POST = handler({ auth: "public" }, async () => {
  await destroySession();
  await clearSessionCookie();
  return { ok: true };
});

export const GET = handler({ auth: "public" }, async () => {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, "Not authenticated.");
  return { user };
});
