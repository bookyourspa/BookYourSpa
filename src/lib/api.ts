import { NextRequest, NextResponse } from "next/server";
import { ZodError, ZodType } from "zod";
import { getCurrentUser, can, Permission, SessionUser } from "./auth";

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

type Ctx = { params: Promise<Record<string, string>> };

interface HandlerOpts {
  /** Required permission (RBAC). Default: any authenticated user. Use "public" for anonymous. */
  auth?: Permission | "public" | "none";
  /** Rate limit key suffix; limiter applied per IP+key. */
  rateLimit?: string;
}

// Simple in-memory sliding-window rate limiter (per IP).
const buckets = new Map<string, number[]>();
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const arr = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) throw new ApiError(429, "Too many requests. Please slow down.");
  arr.push(now);
  buckets.set(key, arr);
}

/**
 * Wraps a route handler with: JSON error handling, validation, auth, RBAC, rate limiting.
 */
export function handler<T = unknown>(
  opts: HandlerOpts,
  fn: (req: NextRequest, ctx: { params: Record<string, string>; user: SessionUser | null }) => Promise<T> | T
) {
  return async (req: NextRequest, ctx?: Ctx) => {
    try {
      if (opts.rateLimit) {
        const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
        rateLimit(`${opts.rateLimit}:${ip}`, 60, 60_000);
      }
      const params = ctx ? await ctx.params : {};
      const user = await getCurrentUser();

      const auth = opts.auth ?? "none";
      if (auth !== "public" && auth !== "none") {
        if (!user) throw new ApiError(401, "Authentication required.");
        if (auth !== ("none" as Permission) && !can(user, auth as Permission)) {
          throw new ApiError(403, "You do not have permission to perform this action.");
        }
      }

      const result = await fn(req, { params, user });
      if (result instanceof NextResponse) return result;
      return NextResponse.json({ ok: true, data: result ?? null });
    } catch (err) {
      if (err instanceof ZodError) {
        return NextResponse.json(
          { ok: false, error: "Validation failed", details: err.flatten() },
          { status: 400 }
        );
      }
      if (err instanceof ApiError) {
        return NextResponse.json(
          { ok: false, error: err.message, details: err.details },
          { status: err.status }
        );
      }
      console.error("[api]", req.method, req.url, err);
      // Never leak internals (DB errors, stack traces, secrets) to clients.
      return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
    }
  };
}

/** Parse JSON body with a zod schema. */
export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "Invalid JSON body.");
  }
  return schema.parse(raw);
}
