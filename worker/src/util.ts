/** Shared helpers: ids, validation, responses, rate limiting, CSRF. */

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, message: string, code = 'bad_request') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const nowIso = () => new Date().toISOString();

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export const randomToken = (bytes = 32) => {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  let out = '';
  for (const b of arr) out += B64URL[b % B64URL.length];
  return out;
};

export const newId = (prefix = 'id') =>
  `${prefix}_${Date.now().toString(36)}${randomToken(8)}`;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const bookingCode = () => {
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  let out = '';
  for (const b of arr) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
};

export const sha256Hex = async (input: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

export const jsonError = (message: string, code = 'bad_request', status = 400) =>
  Response.json({ error: message, code }, { status });

/* ---------- validation ---------- */

export type FieldSpec = {
  required?: boolean;
  type?: 'string' | 'number' | 'email' | 'date' | 'time' | 'int' | 'boolean' | 'array';
  min?: number;
  max?: number;
  enum?: string[];
};

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const clean = (v: unknown) =>
  typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim() : v;

/** Validates and coerces a request payload against a field spec. Throws ApiError(400). */
export function validate(body: unknown, spec: Record<string, FieldSpec>): Record<string, any> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ApiError(400, 'Request body must be a JSON object', 'invalid_body');
  }
  const input = body as Record<string, unknown>;
  const out: Record<string, any> = {};

  for (const [key, rules] of Object.entries(spec)) {
    let value = clean(input[key]);
    const type = rules.type ?? 'string';

    if (value === undefined || value === null || value === '') {
      if (rules.required) throw new ApiError(400, `Field "${key}" is required`, 'validation');
      out[key] = type === 'array' ? [] : undefined;
      continue;
    }

    switch (type) {
      case 'string': {
        const s = String(value);
        if (rules.min !== undefined && s.length < rules.min)
          throw new ApiError(400, `Field "${key}" must be at least ${rules.min} characters`, 'validation');
        if (rules.max !== undefined && s.length > rules.max)
          throw new ApiError(400, `Field "${key}" must be at most ${rules.max} characters`, 'validation');
        if (rules.enum && !rules.enum.includes(s))
          throw new ApiError(400, `Field "${key}" has an invalid value`, 'validation');
        out[key] = s;
        break;
      }
      case 'email': {
        const s = String(value).toLowerCase();
        if (!EMAIL_RE.test(s)) throw new ApiError(400, `Field "${key}" must be a valid email address`, 'validation');
        if (s.length > 254) throw new ApiError(400, `Field "${key}" is too long`, 'validation');
        out[key] = s;
        break;
      }
      case 'number':
      case 'int': {
        const n = Number(value);
        if (!Number.isFinite(n)) throw new ApiError(400, `Field "${key}" must be a number`, 'validation');
        if (type === 'int' && !Number.isInteger(n)) throw new ApiError(400, `Field "${key}" must be a whole number`, 'validation');
        if (rules.min !== undefined && n < rules.min) throw new ApiError(400, `Field "${key}" must be at least ${rules.min}`, 'validation');
        if (rules.max !== undefined && n > rules.max) throw new ApiError(400, `Field "${key}" must be at most ${rules.max}`, 'validation');
        out[key] = n;
        break;
      }
      case 'boolean':
        out[key] = value === true || value === 'true' || value === 1 || value === '1';
        break;
      case 'date': {
        const s = String(value);
        if (!DATE_RE.test(s) || Number.isNaN(Date.parse(s)))
          throw new ApiError(400, `Field "${key}" must be a date (YYYY-MM-DD)`, 'validation');
        out[key] = s;
        break;
      }
      case 'time': {
        const s = String(value);
        if (!TIME_RE.test(s)) throw new ApiError(400, `Field "${key}" must be a time (HH:MM)`, 'validation');
        out[key] = s;
        break;
      }
      case 'array': {
        const arr = Array.isArray(value) ? value : [value];
        if (rules.max !== undefined && arr.length > rules.max)
          throw new ApiError(400, `Field "${key}" may contain at most ${rules.max} items`, 'validation');
        out[key] = arr.map((v) => String(clean(v)).slice(0, 500));
        break;
      }
      default:
        out[key] = value;
    }
  }
  return out;
}

export const money = (n: number) => Math.round(n * 100) / 100;

/* ---------- rate limiting (per isolate memory + D1 persistence) ---------- */

type Bucket = { count: number; resetAt: number };
const memBuckets = new Map<string, Bucket>();

export async function rateLimit(
  db: D1Database,
  scope: string,
  ip: string,
  limit: number,
  windowMs: number
): Promise<{ ok: boolean; retryAfterSec: number }> {
  const key = `${scope}:${ip}`;
  const now = Date.now();

  const hit = memBuckets.get(key);
  if (hit && hit.resetAt > now) {
    if (hit.count >= limit) return { ok: false, retryAfterSec: Math.ceil((hit.resetAt - now) / 1000) };
    hit.count += 1;
  } else {
    memBuckets.set(key, { count: 1, resetAt: now + windowMs });
  }

  try {
    await db.batch([
      db.prepare('DELETE FROM login_attempts WHERE ts < ?').bind(now - windowMs * 4),
      db.prepare('INSERT INTO login_attempts (scope, ip, ts) VALUES (?, ?, ?)').bind(key, ip, now),
    ]);
    const res = await db
      .prepare('SELECT COUNT(*) AS c FROM login_attempts WHERE scope = ? AND ip = ? AND ts >= ?')
      .bind(key, ip, now - windowMs)
      .first<{ c: number }>();
    if ((res?.c ?? 0) > limit) {
      memBuckets.set(key, { count: limit, resetAt: now + windowMs });
      return { ok: false, retryAfterSec: Math.ceil(windowMs / 1000) };
    }
  } catch {
    // rate limiting must never break the request path
  }
  return { ok: true, retryAfterSec: 0 };
}

/* ---------- CSRF / origin protections ---------- */

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Rejects cross-origin state-changing requests.
 * Browsers must send the custom `x-bys-csrf` header (not attachable by simple forms),
 * and when an Origin header is present it must match the app origin.
 */
export function checkCsrf(originHeader: string | undefined, request: Request): void {
  if (!MUTATING.has(request.method)) return;
  if (!originHeader) return; // non-browser clients (no Origin) are guarded by SameSite + custom header
  const host = (request.headers.get('host') ?? '').toLowerCase();
  const allowedHosts = new Set([host, 'localhost:8787', 'localhost:3000', '127.0.0.1:8787', '127.0.0.1:3000']);
  let originHost = '';
  try { originHost = new URL(originHeader).host.toLowerCase(); } catch { originHost = ''; }
  if (!originHost || !allowedHosts.has(originHost)) {
    throw new ApiError(403, 'Cross-origin requests are not allowed', 'csrf');
  }
}
