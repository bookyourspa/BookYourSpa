import { Hono } from 'hono';
import type { AppEnv } from './types';
import { ApiError, validate, newId, nowIso, money } from './util';
import { getSlots, isDateValid } from './booking';
import { sendEmail, emailLayout, h } from './email';
import { getSettings } from './db';

export const publicRoutes = new Hono<AppEnv>();

const SPA_SELECT = `s.*,
  (SELECT MIN(price) FROM treatments t WHERE t.spa_id = s.id AND t.active = 1) AS min_price,
  (SELECT MAX(price) FROM treatments t WHERE t.spa_id = s.id AND t.active = 1) AS max_price`;

const parseJson = <T>(v: unknown, fallback: T): T => {
  try { return JSON.parse(String(v)) as T; } catch { return fallback; }
};

const shapeSpa = (r: any) => ({
  id: r.id, slug: r.slug, name: r.name, destination: r.destination, city: r.city, country: r.country,
  address: r.address, summary: r.summary, description: parseJson<string[]>(r.description, []),
  image: r.image, gallery: parseJson<string[]>(r.gallery, []), facilities: parseJson<string[]>(r.facilities, []),
  categories: parseJson<string[]>(r.categories, []), priceLevel: r.price_level, rating: r.rating,
  reviewCount: r.review_count, featured: !!r.featured, lat: r.lat, lng: r.lng,
  hours: parseJson<any[]>(r.hours, []), status: r.status,
  minPrice: r.min_price != null ? money(Number(r.min_price)) : null,
  maxPrice: r.max_price != null ? money(Number(r.max_price)) : null,
});

publicRoutes.get('/health', (c) => c.json({ ok: true, ts: nowIso() }));

publicRoutes.get('/config', async (c) => {
  const s = await getSettings(c.env.DB);
  const paymentMode = c.env.STRIPE_SECRET_KEY ? 'stripe' : 'demo';
  return c.json({
    name: 'BookYourSpa',
    url: c.env.APP_ORIGIN ?? 'https://bookyourspa.net',
    currency: s.currency ?? 'USD',
    commissionPercent: Number(s.commission_percent ?? 15),
    paymentMode,
    announcement: s.announcement ?? '',
    hero: { eyebrow: s.hero_eyebrow ?? '', title: s.hero_title ?? '', subtitle: s.hero_subtitle ?? '' },
    headings: { featured: s.featured_heading ?? '', reviews: s.reviews_heading ?? '', faq: s.faq_heading ?? '' },
    cancellationHours: Number(s.cancellation_hours ?? 24),
    demoAccounts: s.seeded === '1',
  });
});

/* ---------- spas ---------- */

publicRoutes.get('/spas', async (c) => {
  const q = c.req.query('q')?.slice(0, 80);
  const destination = c.req.query('destination');
  const category = c.req.query('category');
  const minPrice = Number(c.req.query('minPrice') ?? 0) || 0;
  const maxPrice = Number(c.req.query('maxPrice') ?? 0) || 0;
  const sort = c.req.query('sort') ?? 'featured';
  const featured = c.req.query('featured');
  const page = Math.max(1, Number(c.req.query('page') ?? 1) || 1);
  const limit = Math.min(48, Math.max(1, Number(c.req.query('limit') ?? 12) || 12));

  const where: string[] = ["s.status = 'approved'"];
  const binds: unknown[] = [];
  if (q) {
    where.push('(s.name LIKE ? OR s.city LIKE ? OR s.country LIKE ? OR s.summary LIKE ? OR s.destination LIKE ?)');
    const like = `%${q}%`;
    binds.push(like, like, like, like, like);
  }
  if (destination) { where.push('s.destination = ?'); binds.push(destination); }
  if (category) { where.push('s.categories LIKE ?'); binds.push(`%"${category}"%`); }
  if (minPrice > 0) { where.push('(SELECT MIN(price) FROM treatments t WHERE t.spa_id = s.id) >= ?'); binds.push(minPrice); }
  if (maxPrice > 0) { where.push('(SELECT MIN(price) FROM treatments t WHERE t.spa_id = s.id) <= ?'); binds.push(maxPrice); }
  if (featured === '1') where.push('s.featured = 1');

  const order =
    sort === 'rating' ? 's.rating DESC, s.review_count DESC' :
    sort === 'price_asc' ? 'min_price ASC' :
    sort === 'price_desc' ? 'min_price DESC' :
    sort === 'name' ? 's.name ASC' :
    's.featured DESC, s.rating DESC';

  const whereSql = where.join(' AND ');
  const total = await c.env.DB
    .prepare(`SELECT COUNT(*) AS c FROM spas s WHERE ${whereSql}`)
    .bind(...binds)
    .first<{ c: number }>();
  const rows = await c.env.DB
    .prepare(`SELECT ${SPA_SELECT} FROM spas s WHERE ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .bind(...binds, limit, (page - 1) * limit)
    .all();

  return c.json({
    items: rows.results.map(shapeSpa),
    total: total?.c ?? 0,
    page,
    pages: Math.max(1, Math.ceil((total?.c ?? 0) / limit)),
  });
});

publicRoutes.get('/spas/:slug', async (c) => {
  const slug = c.req.param('slug');
  const row = await c.env.DB.prepare(`SELECT ${SPA_SELECT} FROM spas s WHERE s.slug = ? AND s.status = 'approved'`).bind(slug).first();
  if (!row) throw new ApiError(404, 'Spa not found', 'not_found');
  const spa = shapeSpa(row);

  const [treatments, packages, reviews] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT slug, name, category, description, duration_min, price, image FROM treatments WHERE spa_id = ? AND active = 1 ORDER BY price ASC').bind(spa.id),
    c.env.DB.prepare('SELECT slug, name, description, includes, duration_min, price, image FROM packages WHERE spa_id = ? AND active = 1 ORDER BY price ASC').bind(spa.id),
    c.env.DB.prepare("SELECT id, name, city, rating, title, body, created_at FROM reviews WHERE spa_id = ? AND status = 'approved' ORDER BY created_at DESC LIMIT 12").bind(spa.id),
  ]);

  const supplier = await c.env.DB.prepare(
    'SELECT sp.company_name FROM suppliers sp JOIN spas s ON s.supplier_id = sp.id WHERE s.id = ?'
  ).bind(spa.id).first<{ company_name: string }>();

  return c.json({
    spa,
    treatments: treatments.results.map((t: any) => ({ ...t, durationMin: t.duration_min, duration: t.duration_min })),
    packages: packages.results.map((p: any) => ({ ...p, includes: parseJson<string[]>(p.includes, []), durationMin: p.duration_min })),
    reviews: reviews.results.map((r: any) => ({ ...r, createdAt: r.created_at })),
    supplierName: supplier?.company_name ?? null,
  });
});

/* ---------- destinations / catalog ---------- */

publicRoutes.get('/destinations', async (c) => {
  const rows = await c.env.DB
    .prepare("SELECT destination, COUNT(*) AS spa_count, ROUND(AVG(rating),1) AS avg_rating FROM spas WHERE status='approved' GROUP BY destination ORDER BY spa_count DESC")
    .all<{ destination: string; spa_count: number; avg_rating: number }>();
  return c.json({ items: rows.results });
});

publicRoutes.get('/destinations/:slug', async (c) => {
  const slug = c.req.param('slug');
  const rows = await c.env.DB
    .prepare(`SELECT ${SPA_SELECT} FROM spas s WHERE s.destination = ? AND s.status = 'approved' ORDER BY s.featured DESC, s.rating DESC`)
    .bind(slug)
    .all();
  return c.json({ items: rows.results.map(shapeSpa) });
});

/** Grouped treatment catalogue (marketplace-wide, cheapest price shown). */
publicRoutes.get('/treatments', async (c) => {
  const q = c.req.query('q')?.slice(0, 80);
  const category = c.req.query('category');
  const where: string[] = ["sp.status = 'approved'", 't.active = 1'];
  const binds: unknown[] = [];
  if (category) { where.push('t.category = ?'); binds.push(category); }
  if (q) { where.push('(t.name LIKE ? OR t.description LIKE ?)'); binds.push(`%${q}%`, `%${q}%`); }
  const rows = await c.env.DB
    .prepare(`SELECT t.slug, MIN(t.name) AS name, MIN(t.category) AS category, MIN(t.description) AS description,
                     MIN(t.duration_min) AS duration, MIN(t.price) AS price, MIN(t.image) AS image,
                     COUNT(DISTINCT t.spa_id) AS spa_count
              FROM treatments t JOIN spas sp ON sp.id = t.spa_id
              WHERE ${where.join(' AND ')}
              GROUP BY t.slug ORDER BY MIN(t.price) ASC`)
    .bind(...binds)
    .all();
  return c.json({ items: rows.results.map((r: any) => ({ ...r, spaCount: r.spa_count })) });
});

/** Grouped spa-package catalogue. */
publicRoutes.get('/packages', async (c) => {
  const rows = await c.env.DB
    .prepare(`SELECT p.slug, MIN(p.name) AS name, MIN(p.description) AS description, MIN(p.includes) AS includes,
                     MIN(p.duration_min) AS duration, MIN(p.price) AS price, MIN(p.image) AS image,
                     COUNT(DISTINCT p.spa_id) AS spa_count
              FROM packages p JOIN spas sp ON sp.id = p.spa_id
              WHERE sp.status = 'approved' AND p.active = 1
              GROUP BY p.slug ORDER BY MIN(p.price) ASC`)
    .all();
  return c.json({
    items: rows.results.map((r: any) => ({
      ...r, includes: parseJson<string[]>(r.includes, []), spaCount: r.spa_count,
    })),
  });
});

publicRoutes.get('/offers', async (c) => {
  const today = nowIso().slice(0, 10);
  const rows = await c.env.DB
    .prepare("SELECT * FROM offers WHERE active = 1 AND starts_at <= ? AND ends_at >= ? ORDER BY value DESC")
    .bind(today, today)
    .all();
  return c.json({
    items: rows.results.map((r: any) => ({
      code: r.code, title: r.title, description: r.description, discountType: r.discount_type,
      value: r.value, minSpend: r.min_spend, destination: r.destination, endsAt: r.ends_at, image: r.image,
    })),
  });
});

publicRoutes.get('/reviews', async (c) => {
  const slug = c.req.query('spa');
  const limit = Math.min(48, Number(c.req.query('limit') ?? 9) || 9);
  const where = ["r.status = 'approved'"];
  const binds: unknown[] = [];
  if (slug) { where.push('s.slug = ?'); binds.push(slug); }
  const rows = await c.env.DB
    .prepare(`SELECT r.id, r.name, r.city, r.rating, r.title, r.body, r.created_at, s.slug AS spa_slug, s.name AS spa_name
              FROM reviews r JOIN spas s ON s.id = r.spa_id
              WHERE ${where.join(' AND ')} ORDER BY r.created_at DESC LIMIT ?`)
    .bind(...binds, limit)
    .all();
  return c.json({ items: rows.results.map((r: any) => ({ ...r, spaSlug: r.spa_slug, spaName: r.spa_name, createdAt: r.created_at })) });
});

publicRoutes.get('/faqs', async (c) => {
  const rows = await c.env.DB.prepare('SELECT question, answer FROM faqs WHERE active = 1 ORDER BY sort ASC').all();
  return c.json({ items: rows.results });
});

/* ---------- availability ---------- */

publicRoutes.get('/availability', async (c) => {
  const spaSlug = c.req.query('spa');
  const date = c.req.query('date') ?? '';
  const itemType = (c.req.query('itemType') ?? 'treatment') as 'treatment' | 'package';
  const itemSlug = c.req.query('itemSlug');
  if (!spaSlug || !isDateValid(date)) return c.json({ slots: [], reason: 'invalid_input' }, 400);

  const spa = await c.env.DB.prepare("SELECT id, name, hours FROM spas WHERE slug = ? AND status = 'approved'").bind(spaSlug).first<any>();
  if (!spa) throw new ApiError(404, 'Spa not found', 'not_found');

  const table = itemType === 'package' ? 'packages' : 'treatments';
  const item = await c.env.DB
    .prepare(`SELECT name, duration_min, price FROM ${table} WHERE spa_id = ? AND slug = ? AND active = 1`)
    .bind(spa.id, itemSlug ?? '')
    .first<any>();
  if (!item) throw new ApiError(404, 'Treatment or package not found', 'not_found');

  const slots = await getSlots(c.env.DB, spa.id, date, item.duration_min);
  const hours = parseJson<any[]>(spa.hours, []);
  const jsDay = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return c.json({
    slots,
    durationMin: item.duration_min,
    itemName: item.name,
    price: money(Number(item.price)),
    dayHours: hours[jsDay] ?? null,
    leadTimeMin: 120,
  });
});

/* ---------- contact ---------- */

publicRoutes.post('/contact', async (c) => {
  const body = await c.req.json().catch(() => null);
  const v = validate(body, {
    name: { required: true, min: 2, max: 80 },
    email: { required: true, type: 'email' },
    subject: { max: 120 },
    phone: { max: 40 },
    body: { required: true, min: 5, max: 3000 },
  });
  await c.env.DB
    .prepare('INSERT INTO messages (id, name, email, phone, subject, body, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(newId('msg'), v.name, v.email, v.phone ?? null, v.subject ?? 'Enquiry', v.body, 'new', nowIso())
    .run();
  await sendEmail(c.env, 'hello@bookyourspa.net', `New contact enquiry from ${v.name}`,
    emailLayout('New contact enquiry', `<p><strong>${h(v.name)}</strong> (${h(v.email)}) wrote:</p><p>${h(v.body)}</p>`));
  return c.json({ ok: true });
});
