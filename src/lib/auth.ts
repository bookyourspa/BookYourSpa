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

let _devSessionKey: Buffer | null = null;

function sessionKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 16) return Buffer.from(secret, "utf8");
  if (!_devSessionKey) {
    _devSessionKey = crypto.randomBytes(32);
    console.warn("[auth] SESSION_SECRET missing or too short — using an ephemeral per-process session key (dev only)");
  }
  return _devSessionKey;
}

/**
 * Signs `userId.expMs` into a stateless session token (HMAC-SHA256 with
 * SESSION_SECRET). Unlike DB-backed session rows, the signature verifies on
 * any serverless instance, so logins survive per-instance databases.
 */
export function signSession(userId: number, expMs: number): string {
  const payload = `${userId}.${expMs}`;
  const sig = crypto.createHmac("sha256", sessionKey()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

/** Verifies a signed session token; null when tampered, expired, or a legacy raw token. */
export function verifySessionToken(token: string): { userId: number; expMs: number } | null {
  const m = /^(\d{1,15})\.(\d{1,15})\.([0-9a-f]{64})$/.exec(token);
  if (!m) return null;
  const payload = `${m[1]}.${m[2]}`;
  const expected = crypto.createHmac("sha256", sessionKey()).update(payload).digest();
  const given = Buffer.from(m[3], "hex");
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  if (Number(m[2]) <= Date.now()) return null;
  return { userId: Number(m[1]), expMs: Number(m[2]) };
}

export async function createSession(userId: number, ip?: string, ua?: string): Promise<string> {
  const db = getDb();
  const ttlHours = Number(process.env.SESSION_TTL_HOURS || 168);
  const expMs = Date.now() + ttlHours * 3600_000;
  const token = signSession(userId, expMs);
  // Row kept for audit (ip/ua) and best-effort revocation on this instance;
  // authentication itself relies on the signed token, not this row.
  db.prepare(
    "INSERT INTO auth_sessions (id, user_id, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?)"
  ).run(sha256(token), userId, new Date(expMs).toISOString(), ip ?? null, ua ?? null);
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

/**
 * Ensures the account declared by ADMIN_EMAIL / ADMIN_PASSWORD exists as a
 * super admin. Runs on every authenticated context so a wiped DB (e.g.
 * serverless /tmp) self-heals on the first request; no-op when the env vars
 * are unset or empty. An existing super admin is never modified — only a
 * missing account is created, or a non-admin account at that email is
 * promoted (with its password reset to the env value so the declared
 * credential always works). Never logs the password.
 */
export function ensureAdminBootstrap(): void {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;
  if (password.length < 8) {
    console.warn("[auth] ADMIN_PASSWORD is shorter than 8 characters — admin bootstrap skipped");
    return;
  }
  const db = getDb();
  const existing = db
    .prepare("SELECT id, role, admin_level FROM users WHERE email = ? COLLATE NOCASE")
    .get(email) as { id: number; role: string; admin_level: string | null } | undefined;
  if (!existing) {
    db.prepare(
      `INSERT INTO users (email, password_hash, role, admin_level, full_name)
       VALUES (?,?, 'admin', 'super', ?)`
    ).run(email, hashPassword(password), process.env.ADMIN_NAME?.trim() || "Super Admin");
    console.log(`[auth] bootstrapped super admin: ${email}`);
    return;
  }
  if (existing.role !== "admin" || existing.admin_level !== "super") {
    db.prepare(
      `UPDATE users SET role = 'admin', admin_level = 'super', password_hash = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(hashPassword(password), existing.id);
    console.log(`[auth] promoted ${email} to super admin via ADMIN_EMAIL bootstrap`);
  }
}

/** Returns the signed-in user or null. Validates session, expiry and account status. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  ensureAdminBootstrap();
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = getDb();

  const signed = verifySessionToken(token);
  if (signed) {
    // Stateless path: signature + expiry are verifiable on any instance, and
    // the user row is loaded from this instance's DB (the admin row self-heals
    // via ensureAdminBootstrap above), so serverless instance isolation cannot
    // bounce an authenticated request back to the login page.
    const row = db
      .prepare(
        `SELECT u.id, u.email, u.role, u.admin_level, u.full_name, u.status, u.phone, su.id AS supplier_id
           FROM users u LEFT JOIN suppliers su ON su.user_id = u.id
          WHERE u.id = ?`
      )
      .get(signed.userId) as any;
    if (!row || row.status !== "active") return null;
    // Best-effort revocation: honoured on instances that hold the session row.
    const sess = db.prepare("SELECT revoked FROM auth_sessions WHERE id = ?").get(sha256(token)) as any;
    if (sess && sess.revoked) return null;
    return toSessionUser(row);
  }

  // Legacy DB-backed cookie (raw random token) — kept so existing sessions work.
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
  return toSessionUser(row);
}

function toSessionUser(row: any): SessionUser {
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
