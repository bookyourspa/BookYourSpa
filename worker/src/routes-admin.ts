import { Hono, type Context } from 'hono';
import type { AppEnv } from './types';
import { ApiError, validate, newId, nowIso, money } from './util';
import { requireRole, type SessionUser } from './auth';
import { getSettings, setSetting, runSeed, num, invalidateSettings } from './db';
import { sendEmail, emailLayout, h, notify } from './email';

export const adminRoutes = new Hono<AppEnv>();

const admin = (c: Context<AppEnv>): SessionUser => requireRole(c.var.user, ['admin']);
const parse = <T>(v: unknown, fb: T): T => { try { return JSON.parse(String(v)) as T; } catch { return fb; } };

/* ---------- dashboard stats ---------- */

adminRoutes.get('/stats', async (c) => {
  admin(c);
  const [counts, revenue, monthly] = (await c.env.DB.batch([
    c.env.DB.prepare(`SELECT
        (SELECT COUNT(*) FROM bookings) AS bookings,
        (SELECT COUNT(*) FROM bookings WHERE status IN ('pending','confirmed') AND booking_date >= date('now')) AS upcoming,
        (SELECT COUNT(*) FROM bookings WHERE status = 'completed') AS completed,
        (SELECT COUNT(*) FROM users WHERE role = 'customer') AS customers,
        (SELECT COUNT(*) FROM users WHERE role = 'supplier') AS suppliers,
        (SELECT COUNT(*) FROM suppliers WHERE status = 'pending') AS pending_suppliers,
        (SELECT COUNT(*) FROM spas) AS spas,
        (SELECT COUNT(*) FROM spas WHERE status = 'pending') AS pending_spas,
        (SELECT COUNT(*) FROM reviews WHERE status = 'pending') AS pending_reviews,
        (SELECT COUNT(*) FROM messages WHERE status = 'new') AS new_messages`),
    c.env.DB.prepare(`SELECT
        COALESCE(SUM(CASE WHEN payment_status = 'paid' AND status != 'cancelled' THEN total END),0) AS gross,
        COALESCE(SUM(CASE WHEN payment_status = 'paid' AND status != 'cancelled' THEN commission END),0) AS commission,
        COALESCE(SUM(CASE WHEN payment_status = 'paid' AND status != 'cancelled' THEN supplier_earning END),0) AS supplier_earned,
        COUNT(CASE WHEN payment_status = 'paid' AND status != 'cancelled' THEN 1 END) AS paid_bookings
      FROM bookings`),
    c.env.DB.prepare(`SELECT strftime('%Y-%m', booking_date) AS month,
        COUNT(*) AS bookings,
        COALESCE(SUM(CASE WHEN payment_status='paid' AND status != 'cancelled' THEN total END),0) AS revenue,
        COALESCE(SUM(CASE WHEN payment_status='paid' AND status != 'cancelled' THEN commission END),0) AS commission
      FROM bookings WHERE booking_date >= date('now','-6 months') GROUP BY month ORDER BY month ASC`),
  ])) as any[];

  const recent = await c.env.DB
    .prepare(`SELECT b.code, b.item_name, b.booking_date, b.start_time, b.total, b.status, b.payment_status,
                     s.name AS spa_name, u.name AS customer_name
              FROM bookings b JOIN spas s ON s.id = b.spa_id JOIN users u ON u.id = b.customer_id
              ORDER BY b.created_at DESC LIMIT 8`)
    .all();

  return c.json({
    counts: counts.results[0] ?? {},
    revenue: {
      gross: money(Number(revenue.results[0]?.gross ?? 0)),
      commission: money(Number(revenue.results[0]?.commission ?? 0)),
      supplierEarned: money(Number(revenue.results[0]?.supplier_earned ?? 0)),
      paidBookings: Number(revenue.results[0]?.paid_bookings ?? 0),
    },
    monthly: monthly.results,
    recent: recent.results,
  });
});

/* ---------- users ---------- */

adminRoutes.get('/users', async (c) => {
  admin(c);
  const role = c.req.query('role');
  const q = c.req.query('q')?.slice(0, 80);
  const where: string[] = ['1=1'];
  const binds: unknown[] = [];
  if (role && role !== 'all') { where.push('u.role = ?'); binds.push(role); }
  if (q) { where.push('(u.email LIKE ? OR u.name LIKE ?)'); binds.push(`%${q}%`, `%${q}%`); }
  const rows = await c.env.DB
    .prepare(`SELECT u.id, u.email, u.role, u.name, u.phone, u.status, u.created_at,
                     s.company_name, s.status AS supplier_status,
                     (SELECT COUNT(*) FROM bookings WHERE customer_id = u.id) AS booking_count
              FROM users u LEFT JOIN suppliers s ON s.user_id = u.id
              WHERE ${where.join(' AND ')} ORDER BY u.created_at DESC LIMIT 300`)
    .bind(...binds)
    .all();
  return c.json({ items: rows.results.map((r: any) => ({ ...r, createdAt: r.created_at, bookingCount: r.booking_count })) });
});

adminRoutes.patch('/users/:id', async (c) => {
  const me = admin(c);
  const body = await c.req.json().catch(() => null);
  const v = validate(body, { status: { enum: ['active', 'suspended'] }, role: { enum: ['admin', 'supplier', 'customer'] } });
  const target = await c.env.DB.prepare('SELECT id, role, email FROM users WHERE id = ?').bind(c.req.param('id')).first<any>();
  if (!target) throw new ApiError(404, 'User not found', 'not_found');
  if (target.id === me.id && v.role && v.role !== 'admin') throw new ApiError(400, 'You cannot remove your own admin role', 'validation');
  if (v.status === 'suspended' && target.id === me.id) throw new ApiError(400, 'You cannot suspend your own account', 'validation');
  await c.env.DB
    .prepare('UPDATE users SET status = COALESCE(?, status), role = COALESCE(?, role), updated_at = ? WHERE id = ?')
    .bind(v.status ?? null, v.role ?? null, nowIso(), target.id)
    .run();
  if (v.status === 'suspended') await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(target.id).run();
  return c.json({ ok: true });
});

adminRoutes.delete('/users/:id', async (c) => {
  const me = admin(c);
  const target = await c.env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(c.req.param('id')).first<any>();
  if (!target) throw new ApiError(404, 'User not found', 'not_found');
  if (target.id === me.id) throw new ApiError(400, 'You cannot delete your own account', 'validation');
  await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(target.id).run();
  return c.json({ ok: true });
});

/* ---------- supplier approvals ---------- */

adminRoutes.get('/suppliers', async (c) => {
  admin(c);
  const status = c.req.query('status');
  const where = status && status !== 'all' ? 'WHERE s.status = ?' : '';
  const binds: unknown[] = status && status !== 'all' ? [status] : [];
  const rows = await c.env.DB
    .prepare(`SELECT s.id, s.company_name, s.contact_name, s.country, s.website, s.status, s.notes, s.created_at,
                     u.email, u.name AS user_name, u.status AS user_status,
                     (SELECT COUNT(*) FROM spas WHERE supplier_id = s.id) AS spa_count
              FROM suppliers s JOIN users u ON u.id = s.user_id ${where}
              ORDER BY CASE s.status WHEN 'pending' THEN 0 ELSE 1 END, s.created_at DESC LIMIT 300`)
    .bind(...binds)
    .all();
  return c.json({ items: rows.results.map((r: any) => ({ ...r, createdAt: r.created_at })) });
});

adminRoutes.patch('/suppliers/:id', async (c) => {
  const body = await c.req.json().catch(() => null);
  const v = validate(body, { status: { required: true, enum: ['approved', 'rejected', 'pending'] }, notes: { max: 500 } });
  const sup = await c.env.DB
    .prepare('SELECT s.id, s.status, u.email, u.name AS user_name, u.id AS user_id FROM suppliers s JOIN users u ON u.id = s.user_id WHERE s.id = ?')
    .bind(c.req.param('id'))
    .first<any>();
  if (!sup) throw new ApiError(404, 'Supplier not found', 'not_found');

  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE suppliers SET status = ?, notes = COALESCE(?, notes) WHERE id = ?').bind(v.status, v.notes ?? null, sup.id),
    ...(v.status === 'rejected' ? [c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(sup.user_id)] : []),
  ]);

  const origin = c.env.APP_ORIGIN ?? 'https://bookyourspa.net';
  const copy =
    v.status === 'approved'
      ? { title: 'Your supplier account is approved', body: `Congratulations ${sup.user_name} — your account is live. Add treatments, photos and availability from your dashboard, and bookings will start arriving.` }
      : v.status === 'rejected'
        ? { title: 'Supplier application declined', body: `${sup.user_name}, unfortunately your application did not meet our listing standards this time. Reply to this email and our team will explain the next steps.` }
        : { title: 'Supplier application under review', body: `${sup.user_name}, your application is back in review.` };
  await notify(c.env, sup.user_id, 'supplier', copy.title, copy.body, '/supplier');
  await sendEmail(c.env, sup.email, copy.title, emailLayout(copy.title, `<p>${h(copy.body)}</p><p style="margin-top:24px;"><a href="${h(origin)}/supplier" style="background:#10201a;color:#c8a96a;padding:12px 22px;border-radius:6px;text-decoration:none;">Open dashboard</a></p>`));
  return c.json({ ok: true, status: v.status });
});

/* ---------- spa listings ---------- */

adminRoutes.get('/spas', async (c) => {
  admin(c);
  const status = c.req.query('status');
  const q = c.req.query('q')?.slice(0, 80);
  const where: string[] = ['1=1'];
  const binds: unknown[] = [];
  if (status && status !== 'all') { where.push('s.status = ?'); binds.push(status); }
  if (q) { where.push('(s.name LIKE ? OR s.city LIKE ? OR s.slug LIKE ?)'); binds.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const rows = await c.env.DB
    .prepare(`SELECT s.id, s.slug, s.name, s.destination, s.city, s.country, s.status, s.featured, s.rating, s.review_count, s.image, s.created_at,
                     sup.company_name, sup.status AS supplier_status
              FROM spas s LEFT JOIN suppliers sup ON sup.id = s.supplier_id
              WHERE ${where.join(' AND ')}
              ORDER BY CASE s.status WHEN 'pending' THEN 0 ELSE 1 END, s.created_at DESC LIMIT 300`)
    .bind(...binds)
    .all();
  return c.json({ items: rows.results.map((r: any) => ({ ...r, featured: !!r.featured, createdAt: r.created_at })) });
});

adminRoutes.patch('/spas/:id', async (c) => {
  admin(c);
  const body = await c.req.json().catch(() => null);
  const v = validate(body, { status: { enum: ['approved', 'rejected', 'pending'] }, featured: { type: 'boolean' } });
  const spa = await c.env.DB.prepare('SELECT id, name, status, supplier_id FROM spas WHERE id = ?').bind(c.req.param('id')).first<any>();
  if (!spa) throw new ApiError(404, 'Spa not found', 'not_found');
  await c.env.DB
    .prepare('UPDATE spas SET status = COALESCE(?, status), featured = COALESCE(?, featured), updated_at = ? WHERE id = ?')
    .bind(v.status ?? null, v.featured === undefined ? null : v.featured ? 1 : 0, nowIso(), spa.id)
    .run();
  if (v.status && v.status !== spa.status) {
    const owner = await c.env.DB.prepare('SELECT u.id, u.email, u.name FROM suppliers s JOIN users u ON u.id = s.user_id WHERE s.id = ?').bind(spa.supplier_id).first<any>();
    if (owner) {
      const title = v.status === 'approved' ? `Your listing “${spa.name}” is live` : `Your listing “${spa.name}” was not approved`;
      await notify(c.env, owner.id, 'spa', title, v.status === 'approved' ? 'Guests can now find and book it.' : 'Open your dashboard for details.', '/supplier');
      await sendEmail(c.env, owner.email, title, emailLayout(title, `<p>Hello ${h(owner.name)},</p><p>${h(title)}.</p>`));
    }
  }
  return c.json({ ok: true });
});

adminRoutes.delete('/spas/:id', async (c) => {
  admin(c);
  const spa = await c.env.DB.prepare('SELECT id FROM spas WHERE id = ?').bind(c.req.param('id')).first<any>();
  if (!spa) throw new ApiError(404, 'Spa not found', 'not_found');
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM listing_images WHERE spa_id = ?').bind(spa.id),
    c.env.DB.prepare('DELETE FROM spas WHERE id = ?').bind(spa.id),
  ]);
  return c.json({ ok: true });
});

/* ---------- bookings & payments ---------- */

adminRoutes.get('/bookings', async (c) => {
  admin(c);
  const status = c.req.query('status');
  const q = c.req.query('q')?.slice(0, 60);
  const where: string[] = ['1=1'];
  const binds: unknown[] = [];
  if (status && status !== 'all') { where.push('b.status = ?'); binds.push(status); }
  if (q) { where.push('(b.code LIKE ? OR u.name LIKE ? OR u.email LIKE ? OR s.name LIKE ?)'); binds.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`); }
  const rows = await c.env.DB
    .prepare(`SELECT b.code, b.item_name, b.item_type, b.booking_date, b.start_time, b.end_time, b.total, b.commission,
                     b.supplier_earning, b.status, b.payment_status, b.payment_provider, b.promo_code, b.created_at,
                     s.name AS spa_name, s.city AS spa_city, u.name AS customer_name, u.email AS customer_email
              FROM bookings b JOIN spas s ON s.id = b.spa_id JOIN users u ON u.id = b.customer_id
              WHERE ${where.join(' AND ')} ORDER BY b.created_at DESC LIMIT 300`)
    .bind(...binds)
    .all();
  return c.json({ items: rows.results.map((r: any) => ({ ...r, createdAt: r.created_at })) });
});

adminRoutes.patch('/bookings/:code', async (c) => {
  admin(c);
  const body = await c.req.json().catch(() => null);
  const v = validate(body, { status: { enum: ['pending', 'confirmed', 'completed', 'cancelled', 'rejected'] }, reason: { max: 300 } });
  const booking = await c.env.DB.prepare('SELECT id, code, status, payment_status FROM bookings WHERE code = ?').bind(c.req.param('code')).first<any>();
  if (!booking) throw new ApiError(404, 'Booking not found', 'not_found');
  const refund = ['cancelled', 'rejected'].includes(v.status) && booking.payment_status === 'paid';
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE bookings SET status = ?, cancel_reason = COALESCE(?, cancel_reason), cancelled_at = ?, updated_at = ? WHERE id = ?')
      .bind(v.status, v.reason ?? null, ['cancelled', 'rejected'].includes(v.status) ? nowIso() : null, nowIso(), booking.id),
    ...(refund ? [
      c.env.DB.prepare("UPDATE bookings SET payment_status = 'refunded' WHERE id = ?").bind(booking.id),
      c.env.DB.prepare("UPDATE payments SET status = 'refunded' WHERE booking_id = ? AND status = 'succeeded'").bind(booking.id),
    ] : []),
  ]);
  return c.json({ ok: true, refunded: refund });
});

adminRoutes.get('/payments', async (c) => {
  admin(c);
  const rows = await c.env.DB
    .prepare(`SELECT p.id, p.provider, p.amount, p.currency, p.commission, p.status, p.ref, p.created_at,
                     b.code AS booking_code, b.booking_date, u.name AS customer_name, s.name AS spa_name
              FROM payments p JOIN bookings b ON b.id = p.booking_id
              JOIN users u ON u.id = b.customer_id JOIN spas s ON s.id = b.spa_id
              ORDER BY p.created_at DESC LIMIT 300`)
    .all();
  return c.json({ items: rows.results.map((r: any) => ({ ...r, createdAt: r.created_at })) });
});

adminRoutes.get('/commissions', async (c) => {
  admin(c);
  const rows = await c.env.DB
    .prepare(`SELECT sup.id, sup.company_name, u.email,
                     COUNT(b.id) AS bookings,
                     COALESCE(SUM(b.total),0) AS gross,
                     COALESCE(SUM(b.commission),0) AS commission,
                     COALESCE(SUM(b.supplier_earning),0) AS payable
              FROM suppliers sup JOIN users u ON u.id = sup.user_id
              LEFT JOIN spas s ON s.supplier_id = sup.id
              LEFT JOIN bookings b ON b.spa_id = s.id AND b.payment_status = 'paid' AND b.status IN ('confirmed','completed')
              GROUP BY sup.id HAVING bookings > 0 ORDER BY commission DESC`)
    .all();
  return c.json({ items: rows.results });
});

/* ---------- moderation: reviews, messages, email log ---------- */

adminRoutes.get('/reviews', async (c) => {
  admin(c);
  const status = c.req.query('status') ?? 'pending';
  const where = status === 'all' ? '' : 'WHERE r.status = ?';
  const binds: unknown[] = status === 'all' ? [] : [status];
  const rows = await c.env.DB
    .prepare(`SELECT r.id, r.name, r.city, r.rating, r.title, r.body, r.status, r.created_at, s.name AS spa_name, s.id AS spa_id
              FROM reviews r JOIN spas s ON s.id = r.spa_id ${where}
              ORDER BY r.created_at DESC LIMIT 200`)
    .bind(...binds)
    .all();
  return c.json({ items: rows.results.map((r: any) => ({ ...r, createdAt: r.created_at })) });
});

adminRoutes.patch('/reviews/:id', async (c) => {
  admin(c);
  const body = await c.req.json().catch(() => null);
  const v = validate(body, { status: { required: true, enum: ['approved', 'hidden', 'pending'] } });
  const review = await c.env.DB.prepare('SELECT id, spa_id, status, user_id, rating FROM reviews WHERE id = ?').bind(c.req.param('id')).first<any>();
  if (!review) throw new ApiError(404, 'Review not found', 'not_found');
  await c.env.DB.prepare('UPDATE reviews SET status = ? WHERE id = ?').bind(v.status, review.id).run();

  // Approving a real customer review folds it into the spa's rating/count (curated baseline preserved).
  if (v.status === 'approved' && review.status !== 'approved' && review.user_id) {
    const spa = await c.env.DB.prepare('SELECT rating, review_count FROM spas WHERE id = ?').bind(review.spa_id).first<any>();
    const count = Number(spa?.review_count ?? 0);
    const base = Number(spa?.rating ?? 0);
    const nextCount = count + 1;
    const nextRating = Math.round(((base * count + Number(review.rating)) / nextCount) * 10) / 10;
    await c.env.DB.prepare('UPDATE spas SET rating = ?, review_count = ?, updated_at = ? WHERE id = ?')
      .bind(nextRating, nextCount, nowIso(), review.spa_id).run();
  }
  return c.json({ ok: true });
});

adminRoutes.get('/messages', async (c) => {
  admin(c);
  const rows = await c.env.DB.prepare('SELECT * FROM messages ORDER BY created_at DESC LIMIT 200').all();
  return c.json({ items: rows.results.map((r: any) => ({ ...r, createdAt: r.created_at })) });
});

adminRoutes.patch('/messages/:id', async (c) => {
  admin(c);
  const body = await c.req.json().catch(() => null);
  const v = validate(body, { status: { required: true, enum: ['new', 'read', 'replied'] } });
  await c.env.DB.prepare('UPDATE messages SET status = ? WHERE id = ?').bind(v.status, c.req.param('id')).run();
  return c.json({ ok: true });
});

adminRoutes.get('/emails', async (c) => {
  admin(c);
  const rows = await c.env.DB.prepare('SELECT id, to_email, subject, provider, status, created_at FROM emails ORDER BY created_at DESC LIMIT 100').all();
  return c.json({ items: rows.results.map((r: any) => ({ ...r, toEmail: r.to_email, createdAt: r.created_at })) });
});

/* ---------- platform settings (SEO, commission, content) ---------- */

const SETTING_KEYS = [
  'site_title', 'site_description', 'site_keywords', 'og_image', 'hero_eyebrow', 'hero_title', 'hero_subtitle',
  'announcement', 'commission_percent', 'cancellation_hours', 'currency', 'timezone', 'featured_heading',
  'reviews_heading', 'faq_heading', 'schema_version', 'seeded',
];

adminRoutes.get('/settings', async (c) => {
  admin(c);
  const s = await getSettings(c.env.DB);
  const out: Record<string, string> = {};
  for (const k of SETTING_KEYS) if (k in s) out[k] = s[k];
  return c.json({ settings: out, paymentMode: c.env.STRIPE_SECRET_KEY ? 'stripe' : 'demo', emailMode: c.env.RESEND_API_KEY ? 'resend' : 'outbox' });
});

adminRoutes.patch('/settings', async (c) => {
  admin(c);
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') throw new ApiError(400, 'Invalid payload', 'invalid_body');
  const updates: [string, string][] = [];
  for (const [k, raw] of Object.entries(body)) {
    if (!SETTING_KEYS.includes(k)) continue;
    let value = String(raw ?? '').slice(0, 1200);
    if (k === 'commission_percent') {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0 || n > 90) throw new ApiError(400, 'Commission must be between 0 and 90', 'validation');
      value = String(n);
    }
    if (k === 'cancellation_hours') {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0 || n > 720) throw new ApiError(400, 'Cancellation window must be 0–720 hours', 'validation');
      value = String(n);
    }
    updates.push([k, value]);
  }
  if (!updates.length) throw new ApiError(400, 'No valid settings provided', 'validation');
  await c.env.DB.batch(updates.map(([k, v]) =>
    c.env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, v)));
  invalidateSettings();
  await getSettings(c.env.DB);
  return c.json({ ok: true, updated: updates.map(([k]) => k) });
});

/* ---------- FAQs & promotions ---------- */

adminRoutes.get('/faqs', async (c) => {
  admin(c);
  const rows = await c.env.DB.prepare('SELECT * FROM faqs ORDER BY sort ASC').all();
  return c.json({ items: rows.results });
});

adminRoutes.post('/faqs', async (c) => {
  admin(c);
  const body = await c.req.json().catch(() => null);
  const v = validate(body, { question: { required: true, min: 5, max: 200 }, answer: { required: true, min: 5, max: 2000 }, sort: { type: 'int', min: 0, max: 999 } });
  const id = newId('faq');
  await c.env.DB.prepare('INSERT INTO faqs (id, question, answer, sort, active) VALUES (?, ?, ?, ?, 1)').bind(id, v.question, v.answer, v.sort ?? 99).run();
  return c.json({ id }, 201);
});

adminRoutes.patch('/faqs/:id', async (c) => {
  admin(c);
  const body = await c.req.json().catch(() => null);
  const v = validate(body, { question: { min: 5, max: 200 }, answer: { min: 5, max: 2000 }, sort: { type: 'int', min: 0, max: 999 }, active: { type: 'boolean' } });
  const row = await c.env.DB.prepare('SELECT * FROM faqs WHERE id = ?').bind(c.req.param('id')).first<any>();
  if (!row) throw new ApiError(404, 'FAQ not found', 'not_found');
  await c.env.DB.prepare('UPDATE faqs SET question = ?, answer = ?, sort = ?, active = ? WHERE id = ?')
    .bind(v.question ?? row.question, v.answer ?? row.answer, v.sort ?? row.sort, v.active === undefined ? row.active : v.active ? 1 : 0, row.id)
    .run();
  return c.json({ ok: true });
});

adminRoutes.delete('/faqs/:id', async (c) => {
  admin(c);
  await c.env.DB.prepare('DELETE FROM faqs WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

adminRoutes.get('/offers', async (c) => {
  admin(c);
  const rows = await c.env.DB.prepare('SELECT * FROM offers ORDER BY active DESC, ends_at DESC').all();
  return c.json({ items: rows.results });
});

adminRoutes.post('/offers', async (c) => {
  admin(c);
  const body = await c.req.json().catch(() => null);
  const v = validate(body, {
    code: { required: true, min: 3, max: 20 }, title: { required: true, min: 3, max: 120 },
    description: { max: 400 }, discountType: { required: true, enum: ['percent', 'fixed'] },
    value: { required: true, type: 'number', min: 1, max: 10000 }, minSpend: { type: 'number', min: 0, max: 100000 },
    destination: { max: 60 }, startsAt: { required: true, type: 'date' }, endsAt: { required: true, type: 'date' },
    image: { max: 300 }, active: { type: 'boolean' },
  });
  if (v.endsAt < v.startsAt) throw new ApiError(400, 'End date must be after start date', 'validation');
  const code = v.code.toUpperCase();
  const dupe = await c.env.DB.prepare('SELECT 1 AS x FROM offers WHERE code = ?').bind(code).first();
  if (dupe) throw new ApiError(409, 'That code already exists', 'duplicate');
  const id = newId('off');
  await c.env.DB
    .prepare('INSERT INTO offers (id, code, title, description, discount_type, value, min_spend, destination, starts_at, ends_at, image, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, code, v.title, v.description ?? '', v.discountType, v.value, v.minSpend ?? 0, v.destination || null, v.startsAt, v.endsAt, v.image ?? '/images/treatment/signature-massage.jpg', v.active === false ? 0 : 1)
    .run();
  return c.json({ id, code }, 201);
});

adminRoutes.patch('/offers/:id', async (c) => {
  admin(c);
  const body = await c.req.json().catch(() => null);
  const v = validate(body, {
    title: { min: 3, max: 120 }, description: { max: 400 }, discountType: { enum: ['percent', 'fixed'] },
    value: { type: 'number', min: 1, max: 10000 }, minSpend: { type: 'number', min: 0, max: 100000 },
    startsAt: { type: 'date' }, endsAt: { type: 'date' }, image: { max: 300 }, active: { type: 'boolean' },
  });
  const row = await c.env.DB.prepare('SELECT * FROM offers WHERE id = ?').bind(c.req.param('id')).first<any>();
  if (!row) throw new ApiError(404, 'Offer not found', 'not_found');
  await c.env.DB
    .prepare('UPDATE offers SET title = ?, description = ?, discount_type = ?, value = ?, min_spend = ?, starts_at = ?, ends_at = ?, image = ?, active = ? WHERE id = ?')
    .bind(v.title ?? row.title, v.description ?? row.description, v.discountType ?? row.discount_type,
      v.value ?? row.value, v.minSpend ?? row.min_spend, v.startsAt ?? row.starts_at, v.endsAt ?? row.ends_at,
      v.image ?? row.image, v.active === undefined ? row.active : v.active ? 1 : 0, row.id)
    .run();
  return c.json({ ok: true });
});

adminRoutes.delete('/offers/:id', async (c) => {
  admin(c);
  await c.env.DB.prepare('DELETE FROM offers WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

/* ---------- maintenance ---------- */

/** Clears failed-login counters (ops tool after an incident or for tests). */
adminRoutes.post('/rate-limits/reset', async (c) => {
  admin(c);
  await c.env.DB.prepare('DELETE FROM login_attempts').run();
  return c.json({ ok: true });
});

adminRoutes.post('/seed', async (c) => {
  admin(c);
  const body = await c.req.json().catch(() => ({}));
  const result = await runSeed(c.env.DB, { force: body?.force === true });
  return c.json(result);
});

adminRoutes.get('/audit', async (c) => {
  admin(c);
  const [tables, settings] = (await c.env.DB.batch([
    c.env.DB.prepare(`SELECT 'users' AS t, COUNT(*) AS n FROM users UNION ALL SELECT 'spas', COUNT(*) FROM spas UNION ALL
                      SELECT 'treatments', COUNT(*) FROM treatments UNION ALL SELECT 'packages', COUNT(*) FROM packages UNION ALL
                      SELECT 'bookings', COUNT(*) FROM bookings UNION ALL SELECT 'payments', COUNT(*) FROM payments UNION ALL
                      SELECT 'reviews', COUNT(*) FROM reviews UNION ALL SELECT 'emails', COUNT(*) FROM emails UNION ALL
                      SELECT 'notifications', COUNT(*) FROM notifications UNION ALL SELECT 'messages', COUNT(*) FROM messages`),
    c.env.DB.prepare('SELECT key, value FROM settings'),
  ])) as any[];
  return c.json({ counts: tables.results, settings: settings.results });
});
