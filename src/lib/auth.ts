import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "./db";

const SESSION_COOKIE = "bys_session";

export type Role = "customer" | "supplier" | "admin";
export type AdminLevel = "super" | "operations" | "finance" | "content" | "support" | null;

export interface SessionUser {
  id: number;
  email: string;
  role: Role;
  admin_level: AdminLevel;
  full_name: string;
  status: string;
  phone: string | null;
  supplier_id: number | null;
}

/** Hash a password with scrypt + per-user random salt. */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, salt, hash] = stored.split(":");
    if (scheme !== "scrypt" || !salt || !hash) return false;
    const candidate = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, "hex");
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

/** SHA-256 hash for session tokens / reset tokens (never store raw). */
export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export async function createSession(userId: number, ip?: string, ua?: string): Promise<string> {
  const db = getDb();
  const token = crypto.randomBytes(32).toString("hex");
  const ttlHours = Number(process.env.SESSION_TTL_HOURS || 168);
  const expires = new Date(Date.now() + ttlHours * 3600_000).toISOString();
  db.prepare(
    "INSERT INTO auth_sessions (id, user_id, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?)"
  ).run(sha256(token), userId, expires, ip ?? null, ua ?? null);
  return token;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return;
  getDb().prepare("UPDATE auth_sessions SET revoked = 1 WHERE id = ?").run(sha256(token));
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  const ttlHours = Number(process.env.SESSION_TTL_HOURS || 168);
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ttlHours * 3600,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Returns the signed-in user or null. Validates session, expiry and account status. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = getDb();
  const row = db
    .prepare(
      `SELECT u.id, u.email, u.role, u.admin_level, u.full_name, u.status, u.phone, s.expires_at, s.revoked,
              su.id AS supplier_id
         FROM auth_sessions s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN suppliers su ON su.user_id = u.id
        WHERE s.id = ?`
    )
    .get(sha256(token)) as any;
  if (!row || row.revoked) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  if (row.status !== "active") return null;
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    admin_level: row.admin_level,
    full_name: row.full_name,
    status: row.status,
    phone: row.phone,
    supplier_id: row.supplier_id ?? null,
  };
}

export type Permission =
  | "admin:all"
  | "admin:suppliers"
  | "admin:finance"
  | "admin:content"
  | "admin:support"
  | "supplier:manage"
  | "customer:book";

const ADMIN_PERMISSIONS: Record<string, Permission[]> = {
  super: ["admin:all"],
  operations: ["admin:suppliers", "admin:support", "admin:content"],
  finance: ["admin:finance"],
  content: ["admin:content"],
  support: ["admin:support"],
};

export function can(user: SessionUser | null, perm: Permission): boolean {
  if (!user || user.status !== "active") return false;
  if (perm === "customer:book") return user.role === "customer" || user.role === "supplier" || user.role === "admin";
  if (perm === "supplier:manage") return user.role === "admin" || user.role === "supplier";
  if (perm.startsWith("admin:")) {
    if (user.role !== "admin") return false;
    if (user.admin_level === "super") return true;
    return (ADMIN_PERMISSIONS[user.admin_level ?? "support"] || []).includes(perm);
  }
  return false;
}
