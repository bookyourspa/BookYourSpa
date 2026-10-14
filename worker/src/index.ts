import { Hono } from 'hono';
import type { AppEnv } from './types';
import { ensureSchema, runSeed } from './db';
import { parseCookies, SESSION_COOKIE, getUserBySession } from './auth';
import { checkCsrf, ApiError, jsonError } from './util';
import { setEnvOrigin } from './email';
import { setPaymentOrigin } from './payment';
import { publicRoutes } from './routes-public';
import { authRoutes } from './routes-auth';
import { bookingRoutes } from './routes-bookings';
import { supplierRoutes } from './routes-supplier';
import { adminRoutes } from './routes-admin';

const app = new Hono<AppEnv>();

let bootPromise: Promise<void> | null = null;
const boot = (env: AppEnv['Bindings']) => {
  if (!bootPromise) {
    bootPromise = (async () => {
      await ensureSchema(env.DB);
      await runSeed(env.DB);
    })().catch((err) => {
      console.error('boot failed', err);
      bootPromise = null; // retry on next request
    });
  }
  return bootPromise;
};

const securityHeaders = (isHttps: boolean) => ({
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Content-Security-Policy':
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; " +
    "img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; " +
    "font-src 'self' data:; connect-src 'self' https://cloudflareinsights.com https://static.cloudflareinsights.com",
  ...(isHttps ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {}),
});

app.use('*', async (c, next) => {
  const host = c.req.header('host') ?? '';
  const requestOrigin = `${host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https'}://${host}`;
  const appOrigin = c.env.APP_ORIGIN || requestOrigin;
  setEnvOrigin(appOrigin);
  setPaymentOrigin(appOrigin);
  c.set('ip', c.req.header('cf-connecting-ip')?.split(',')[0]?.trim() || 'local');

  await boot(c.env);

  const token = parseCookies(c.req.header('cookie'))[SESSION_COOKIE];
  c.set('user', token ? await getUserBySession(c.env.DB, token) : null);

  if (c.req.method === 'POST' || c.req.method === 'PATCH' || c.req.method === 'PUT' || c.req.method === 'DELETE') {
    checkCsrf(c.req.header('origin'), c.req.raw);
    const path = new URL(c.req.url).pathname;
    if (path.startsWith('/api/') && path !== '/api/payments/webhook' && !c.req.header('x-bys-csrf')) {
      return jsonError('Missing CSRF header', 'csrf', 403);
    }
  }

  await next();
  const secure = appOrigin.startsWith('https://');
  for (const [k, v] of Object.entries(securityHeaders(secure))) c.header(k, v);
});

app.onError((err, c) => {
  if (err instanceof ApiError) return c.json({ error: err.message, code: err.code }, err.status as any);
  console.error('unhandled', err);
  return c.json({ error: 'Something went wrong. Please try again.', code: 'server_error' }, 500);
});

app.route('/api/auth', authRoutes);
app.route('/api/supplier', supplierRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api', bookingRoutes);
app.route('/api', publicRoutes);

const homeFor = (role: string) => (role === 'admin' ? '/admin' : role === 'supplier' ? '/supplier' : '/login');

app.notFound(async (c) => {
  const path = new URL(c.req.url).pathname;
  if (path.startsWith('/api/')) return c.json({ error: 'Not found', code: 'not_found' }, 404);

  // Role-gated dashboard HTML: /admin (admin only), /supplier (supplier only).
  // /supplier/register stays public — that is the supplier onboarding entry point.
  const isPublicSupplierPath = path.startsWith('/supplier/register');
  const wanted = path === '/admin' || path.startsWith('/admin/') ? 'admin'
    : !isPublicSupplierPath && (path === '/supplier' || path.startsWith('/supplier/')) ? 'supplier'
    : null;
  if (wanted) {
    const user = c.var.user;
    if (!user) return c.redirect(`/login?next=${encodeURIComponent(path)}`, 302);
    if (user.role !== wanted) return c.redirect(homeFor(user.role), 302);
  }
  if (c.env.ASSETS) {
    const res = await c.env.ASSETS.fetch(c.req.raw);
    // Normalise the asset server's trailing-slash redirect (307) into the final response.
    if ((res.status === 307 || res.status === 308) && res.headers.get('location')) {
      const base = new URL(c.req.url);
      const target = new URL(res.headers.get('location')!, base).toString();
      return c.env.ASSETS.fetch(target);
    }
    return res;
  }
  return c.json({ error: 'Not found', code: 'not_found' }, 404);
});

export default app;
