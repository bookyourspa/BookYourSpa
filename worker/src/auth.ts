/** Password hashing, session management and role guards. */
import { ApiError, newId, nowIso, randomToken, sha256Hex } from './util';

export type Role = 'admin' | 'supplier' | 'customer';

export type SessionUser = {
  id: string; email: string; role: Role; name: string;
  phone: string | null; status: string; supplier_id: string | null; supplier_status: string | null;
};

const PBKDF2_ITERATIONS = 100_000;
export const SESSION_COOKIE = 'bys_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

const enc = new TextEncoder();

const toB64 = (buf: ArrayBuffer) => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};

const fromB64 = (s: string) => {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
};

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    256
  );
  return `pbkdf2$${PBKDF2_ITERATIONS}$${btoa(String.fromCharCode(...salt))}$${toB64(bits)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [algo, iterStr, saltB64, hashB64] = stored.split('$');
    if (algo !== 'pbkdf2') return false;
    const iterations = Number(iterStr);
    if (!Number.isFinite(iterations) || iterations < 1000) return false;
    const salt = fromB64(saltB64);
    const expected = fromB64(hashB64);
    const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      key,
      expected.length * 8
    );
    const got = new Uint8Array(bits);
    let diff = 0;
    for (let i = 0; i < got.length; i++) diff |= got[i] ^ expected[i];
    return diff === 0;
  } catch {
    return false;
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function sessionCookie(token: string, secure: boolean, maxAgeSec = SESSION_TTL_MS / 1000) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`;
}

export function clearSessionCookie(secure: boolean) {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

export async function createSession(
  db: D1Database,
  userId: string,
  meta: { ip?: string; ua?: string } = {}
) {
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const now = Date.now();
  await db
    .prepare(
      'INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(newId('ses'), userId, tokenHash, new Date(now).toISOString(), new Date(now + SESSION_TTL_MS).toISOString(), meta.ip ?? null, (meta.ua ?? '').slice(0, 250) || null)
    .run();
  return token;
}

export async function getUserBySession(db: D1Database, token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const row = await db
    .prepare(
      `SELECT u.id, u.email, u.role, u.name, u.phone, u.status,
              s.id AS supplier_id, s.status AS supplier_status
       FROM sessions se
       JOIN users u ON u.id = se.user_id
       LEFT JOIN suppliers s ON s.user_id = u.id
       WHERE se.token_hash = ? AND se.expires_at > ?`
    )
    .bind(tokenHash, nowIso())
    .first<SessionUser>();
  if (!row) return null;
  if (row.status !== 'active') return null;
  return row;
}

export async function destroySession(db: D1Database, token: string | undefined) {
  if (!token) return;
  await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
}

/** Route guard: requires an authenticated user, optionally one of the given roles. */
export function requireRole(user: SessionUser | null, roles?: Role[]): SessionUser {
  if (!user) throw new ApiError(401, 'You must be signed in to continue', 'unauthorized');
  if (roles && !roles.includes(user.role)) {
    throw new ApiError(403, 'You do not have permission to access this resource', 'forbidden');
  }
  if (user.role === 'supplier' && user.supplier_status === 'rejected') {
    throw new ApiError(403, 'Your supplier account has been rejected. Please contact support.', 'forbidden');
  }
  return user;
}

/** Ensures the supplier belongs to the record they are touching. */
export function ownsSupplier(user: SessionUser, supplierId: string | null | undefined) {
  if (!supplierId || supplierId !== user.supplier_id) {
    throw new ApiError(403, 'This resource belongs to another supplier', 'forbidden');
  }
}
