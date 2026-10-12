import { Hono } from 'hono';
import type { AppEnv } from './types';
import { ApiError, validate, newId, nowIso, rateLimit, randomToken } from './util';
import { hashPassword, verifyPassword, createSession, destroySession, sessionCookie, clearSessionCookie, SESSION_COOKIE, parseCookies, type SessionUser } from './auth';
import { sendEmail, emailLayout, h, notify } from './email';
import { requireRole } from './auth';

export const authRoutes = new Hono<AppEnv>();

const isSecure = (origin: string | undefined) => (origin ?? '').startsWith('https://');

authRoutes.post('/register', async (c) => {
  const ip = c.var.ip;
  const rl = await rateLimit(c.env.DB, 'register', ip, 12, 10 * 60 * 1000);
  if (!rl.ok) throw new ApiError(429, `Too many attempts. Try again in ${rl.retryAfterSec}s.`, 'rate_limited');

  const body = await c.req.json().catch(() => null);
  const v = validate(body, {
    role: { required: true, enum: ['customer', 'supplier'] },
    name: { required: true, min: 2, max: 80 },
    email: { required: true, type: 'email' },
    password: { required: true, min: 8, max: 128 },
    phone: { max: 40 },
    companyName: { max: 120 },
    country: { max: 80 },
    website: { max: 200 },
  });
  if (!/[a-zA-Z]/.test(v.password) || !/\d/.test(v.password)) {
    throw new ApiError(400, 'Password must contain both letters and numbers', 'validation');
  }

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(v.email).first();
  if (existing) throw new ApiError(409, 'An account with this email already exists', 'email_taken');

  const userId = newId('usr');
  await c.env.DB
    .prepare('INSERT INTO users (id, email, password_hash, role, name, phone, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(userId, v.email, await hashPassword(v.password), v.role, v.name, v.phone ?? null, 'active', nowIso(), nowIso())
    .run();

  let supplierStatus: string | null = null;
  if (v.role === 'supplier') {
    const supplierId = newId('sup');
    supplierStatus = 'pending';
    await c.env.DB
      .prepare('INSERT INTO suppliers (id, user_id, company_name, contact_name, country, website, status, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(supplierId, userId, v.companyName ?? `${v.name} Spa`, v.name, v.country ?? null, v.website ?? null, 'pending', null, nowIso())
      .run();
    await sendEmail(c.env, v.email, 'Your supplier registration is being reviewed',
      emailLayout('Supplier registration received', `
        <p>Hello ${h(v.name)},</p>
        <p>Thank you for applying to join BookYourSpa as a supplier. Our team reviews registrations within one business day.</p>
        <p>You can sign in at <a href="${h(c.env.APP_ORIGIN ?? 'https://bookyourspa.net')}/supplier">your supplier dashboard</a> — listings become editable as soon as your account is approved.</p>`));
    const admins = await c.env.DB.prepare("SELECT id FROM users WHERE role = 'admin'").all<{ id: string }>();
    for (const a of admins.results) {
      await notify(c.env, a.id, 'supplier', 'New supplier registration', `${v.companyName ?? v.name} — ${v.email}`, '/admin?tab=suppliers');
    }
  } else {
    await sendEmail(c.env, v.email, 'Welcome to BookYourSpa',
      emailLayout('Welcome', `
        <p>Hello ${h(v.name)},</p>
        <p>Your BookYourSpa account is ready. Browse curated spas and book your first ritual whenever the mood takes you.</p>
        <p style="margin-top:24px;"><a href="${h(c.env.APP_ORIGIN ?? 'https://bookyourspa.net')}/login" style="background:#10201a;color:#c8a96a;padding:12px 22px;border-radius:6px;text-decoration:none;">Sign in</a></p>`));
  }

  const token = await createSession(c.env.DB, userId, { ip, ua: c.req.header('user-agent') ?? '' });
  const user: SessionUser = {
    id: userId, email: v.email, role: v.role, name: v.name, phone: v.phone ?? null,
    status: 'active', supplier_id: null, supplier_status: supplierStatus,
  };
  c.header('Set-Cookie', sessionCookie(token, isSecure(c.env.APP_ORIGIN)));
  return c.json({ user, supplierStatus }, 201);
});

authRoutes.post('/login', async (c) => {
  const ip = c.var.ip;
  const body = await c.req.json().catch(() => null);
  const v = validate(body, { email: { required: true, type: 'email' }, password: { required: true, min: 1, max: 128 } });
  const scope = `login:${v.email}`;
  const rl = await rateLimit(c.env.DB, scope, ip, 8, 15 * 60 * 1000);
  if (!rl.ok) throw new ApiError(429, `Too many sign-in attempts. Try again in ${rl.retryAfterSec}s.`, 'rate_limited');

  const user = await c.env.DB
    .prepare('SELECT id, email, password_hash, role, name, phone, status FROM users WHERE email = ?')
    .bind(v.email)
    .first<any>();
  const ok = user && (await verifyPassword(v.password, user.password_hash));
  if (!ok) throw new ApiError(401, 'Incorrect email or password', 'invalid_credentials');
  if (user.status !== 'active') throw new ApiError(403, 'This account has been suspended. Contact support.', 'suspended');

  const supplier = await c.env.DB.prepare('SELECT id, status FROM suppliers WHERE user_id = ?').bind(user.id).first<any>();
  const token = await createSession(c.env.DB, user.id, { ip, ua: c.req.header('user-agent') ?? '' });
  c.header('Set-Cookie', sessionCookie(token, isSecure(c.env.APP_ORIGIN)));
  return c.json({
    user: {
      id: user.id, email: user.email, role: user.role, name: user.name, phone: user.phone,
      status: user.status, supplier_id: supplier?.id ?? null, supplier_status: supplier?.status ?? null,
    },
  });
});

authRoutes.post('/logout', async (c) => {
  const token = parseCookies(c.req.header('cookie'))[SESSION_COOKIE];
  await destroySession(c.env.DB, token);
  c.header('Set-Cookie', clearSessionCookie(isSecure(c.env.APP_ORIGIN)));
  return c.json({ ok: true });
});

authRoutes.get('/me', (c) => c.json({ user: c.var.user ?? null }));
