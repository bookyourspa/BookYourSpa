import { Hono, type Context } from 'hono';
import type { AppEnv } from './types';
import { ApiError, validate, newId, nowIso, money, randomToken, rateLimit } from './util';
import type { FieldSpec } from './util';
import { requireRole, ownsSupplier, type SessionUser } from './auth';
import { getSettings, num } from './db';
import { sendEmail, emailLayout, h, notify } from './email';
import { importGooglePlace } from './places';
import { sanitizeRichHtml, richTextToPlain } from './richtext';
import { SPA_CATEGORIES, SPA_TYPES, GENRES, DELIVERY_TYPES, legacyCategoryFor, onlyValid } from './taxonomy';

export const supplierRoutes = new Hono<AppEnv>();

const supplierUser = (c: Context<AppEnv>): SessionUser => {
  const user = requireRole(c.var.user, ['supplier']);
  if (!user.supplier_id) throw new ApiError(403, 'No supplier profile is linked to this account', 'forbidden');
  return user;
};

const approvedSupplier = (c: Context<AppEnv>): SessionUser => {
  const user = supplierUser(c);
  if (user.supplier_status !== 'approved') {
    throw new ApiError(403, 'Your supplier account is awaiting admin approval', 'pending_approval');
  }
  return user;
};

const slugify = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'item';

const parse = <T>(v: unknown, fb: T): T => { try { return JSON.parse(String(v)) as T; } catch { return fb; } };

/**
 * Duration options arrive as [60, 90, 120] — whole minutes, 15–480, sorted,
 * deduplicated. The first entry becomes the canonical duration_min (slots,
 * bookings, legacy clients); the rest are alternatives the guest may pick.
 */
const normalizeDurations = (raw: unknown, fallback?: number): number[] => {
  const out: number[] = [];
  if (Array.isArray(raw)) {
    for (const d of raw) {
      const n = Math.round(Number(d));
      if (Number.isFinite(n) && n >= 15 && n <= 480 && !out.includes(n)) out.push(n);
      if (out.length >= 8) break;
    }
  }
  if (!out.length && fallback != null && Number.isFinite(Number(fallback))) out.push(Math.round(Number(fallback)));
  return out.sort((a, b) => a - b);
};

supplierRoutes.get('/status', (c) => {
  const user = c.var.user;
  if (!user || user.role !== 'supplier') return c.json({ status: 'unauthenticated' });
  return c.json({ status: user.supplier_status ?? 'none', name: user.name });
});

/* ---------- overview ---------- */

supplierRoutes.get('/overview', async (c) => {
  const user = approvedSupplier(c);
  const today = nowIso().slice(0, 10);
  const monthStart = today.slice(0, 7) + '-01';

  // Counts are computed here (not on the client) so the overview rows carry the same
  // `counts` shape as GET /supplier/spas — the dashboard renders treatments/packages per listing.
  const spaRows = await c.env.DB
    .prepare(`SELECT s.id, s.slug, s.name, s.city, s.status, s.featured, s.rating, s.review_count, s.image,
      (SELECT COUNT(*) FROM treatments t WHERE t.spa_id = s.id AND t.active = 1) AS treatment_count,
      (SELECT COUNT(*) FROM packages p WHERE p.spa_id = s.id AND p.active = 1) AS package_count,
      (SELECT COUNT(*) FROM bookings b WHERE b.spa_id = s.id AND b.status IN ('pending','confirmed') AND b.booking_date >= ?) AS upcoming_count
      FROM spas s WHERE s.supplier_id = ? ORDER BY s.name`)
    .bind(today, user.supplier_id)
    .all();
  const spaIds = spaRows.results.map((r: any) => r.id);

  let stats = { upcoming: 0, pendingRequests: 0, completed: 0, monthEarnings: 0, monthCommission: 0, totalEarnings: 0 };
  if (spaIds.length) {
    const marks = spaIds.map(() => '?').join(',');
    const [up, pend, comp, mon, monCom, tot] = await c.env.DB.batch([
      c.env.DB.prepare(`SELECT COUNT(*) AS c FROM bookings WHERE spa_id IN (${marks}) AND status IN ('pending','confirmed') AND booking_date >= ?`).bind(...spaIds, today),
      c.env.DB.prepare(`SELECT COUNT(*) AS c FROM bookings WHERE spa_id IN (${marks}) AND status = 'pending' AND payment_status = 'paid'`).bind(...spaIds),
      c.env.DB.prepare(`SELECT COUNT(*) AS c FROM bookings WHERE spa_id IN (${marks}) AND status = 'completed'`).bind(...spaIds),
      c.env.DB.prepare(`SELECT COALESCE(SUM(supplier_earning),0) AS s FROM bookings WHERE spa_id IN (${marks}) AND payment_status = 'paid' AND status IN ('confirmed','completed') AND booking_date >= ?`).bind(...spaIds, monthStart),
      c.env.DB.prepare(`SELECT COALESCE(SUM(commission),0) AS s FROM bookings WHERE spa_id IN (${marks}) AND payment_status = 'paid' AND booking_date >= ?`).bind(...spaIds, monthStart),
      c.env.DB.prepare(`SELECT COALESCE(SUM(supplier_earning),0) AS s FROM bookings WHERE spa_id IN (${marks}) AND payment_status = 'paid' AND status IN ('confirmed','completed')`).bind(...spaIds),
    ]) as any[];
    stats = {
      upcoming: Number(up.results[0]?.c ?? 0), pendingRequests: Number(pend.results[0]?.c ?? 0),
      completed: Number(comp.results[0]?.c ?? 0), monthEarnings: money(Number(mon.results[0]?.s ?? 0)),
      monthCommission: money(Number(monCom.results[0]?.s ?? 0)), totalEarnings: money(Number(tot.results[0]?.s ?? 0)),
    };
  }

  const recent = spaIds.length
    ? (await c.env.DB
        .prepare(`SELECT ${'b.*, s.name AS spa_name, s.slug AS spa_slug, s.city AS spa_city, s.image AS spa_image, s.address AS spa_address'} FROM bookings b JOIN spas s ON s.id = b.spa_id WHERE b.spa_id IN (${spaIds.map(() => '?').join(',')}) ORDER BY b.created_at DESC LIMIT 8`)
        .bind(...spaIds)
        .all()).results
    : [];

  return c.json({
    stats,
    spas: spaRows.results.map(({ treatment_count, package_count, upcoming_count, ...r }: any) => ({
      ...r,
      featured: !!r.featured,
      counts: {
        treatments: Number(treatment_count ?? 0),
        packages: Number(package_count ?? 0),
        upcoming: Number(upcoming_count ?? 0),
      },
    })),
    recent,
  });
});

/* ---------- spa listings ---------- */

/* ---------- Google Maps place import ---------- */

// Paste a /maps/place/… link → recover name, pin, phone, website and address.
// The fetch is server-side (no CORS), best-effort, and never blocks the save:
// whatever Google won't give us the supplier types in by hand.
supplierRoutes.post('/places/import', async (c) => {
  const user = approvedSupplier(c);
  void user;
  const rl = await rateLimit(c.env.DB, 'places-import', c.var.ip, 20, 60_000);
  if (!rl.ok) throw new ApiError(429, `Too many imports — retry in ${rl.retryAfterSec}s`, 'rate_limited');
  const body = await c.req.json().catch(() => null);
  const details = await importGooglePlace(String(body?.url ?? ''));
  return c.json(details);
});

supplierRoutes.get('/spas', async (c) => {
  const user = approvedSupplier(c);
  const rows = await c.env.DB
    .prepare('SELECT * FROM spas WHERE supplier_id = ? ORDER BY created_at DESC')
    .bind(user.supplier_id)
    .all();
  const shaped: any[] = [];
  for (const r of rows.results as any[]) {
    const counts = await c.env.DB.batch([
      c.env.DB.prepare('SELECT COUNT(*) AS c FROM treatments WHERE spa_id = ? AND active = 1').bind(r.id),
      c.env.DB.prepare('SELECT COUNT(*) AS c FROM packages WHERE spa_id = ? AND active = 1').bind(r.id),
      c.env.DB.prepare("SELECT COUNT(*) AS c FROM bookings WHERE spa_id = ? AND status IN ('pending','confirmed') AND booking_date >= ?").bind(r.id, nowIso().slice(0, 10)),
    ]) as any[];
    shaped.push({
      id: r.id, slug: r.slug, name: r.name, city: r.city, country: r.country, destination: r.destination,
      address: r.address, summary: r.summary, description: parse<string[]>(r.description, []),
      image: r.image, gallery: parse<string[]>(r.gallery, []), facilities: parse<string[]>(r.facilities, []),
      categories: parse<string[]>(r.categories, []), priceLevel: r.price_level, rating: r.rating,
      reviewCount: r.review_count, featured: !!r.featured, status: r.status, hours: parse<any[]>(r.hours, []),
      lat: r.lat, lng: r.lng,
      phone: r.phone ?? '', email: r.email ?? '', website: r.website ?? '', mapsUrl: r.maps_url ?? '',
      spaCategories: parse<string[]>(r.spa_categories, []), spaTypes: parse<string[]>(r.spa_types, []),
      genre: r.genre ?? 'both', doorstep: !!r.doorstep,
      counts: { treatments: Number(counts[0].results[0]?.c ?? 0), packages: Number(counts[1].results[0]?.c ?? 0), upcoming: Number(counts[2].results[0]?.c ?? 0) },
    });
  }
  return c.json({ items: shaped });
});

const spaBodySpec = {
  name: { required: true, min: 3, max: 120 },
  destination: { required: true, max: 60 },
  city: { required: true, max: 80 },
  country: { required: true, max: 80 },
  address: { required: true, min: 5, max: 200 },
  summary: { required: true, min: 10, max: 300 },
  image: { max: 300 },
  facilities: { type: 'array' as const, max: 30 },
  categories: { type: 'array' as const, max: 10 },
  gallery: { type: 'array' as const, max: 12 },
  description: { type: 'array' as const, max: 6 },
  priceLevel: { type: 'int' as const, min: 1, max: 5 },
  lat: { type: 'number' as const },
  lng: { type: 'number' as const },
  // contact + taxonomy (Google Maps import fills phone/website/mapsUrl)
  phone: { max: 40 },
  email: { type: 'email' as const },
  website: { max: 300 },
  mapsUrl: { max: 500 },
  spaCategories: { type: 'array' as const, max: 6 },
  spaTypes: { type: 'array' as const, max: 14 },
  genre: { enum: [...GENRES] },
  doorstep: { type: 'boolean' as const },
};

/** PATCH accepts any subset of the POST fields — same shape, nothing required. */
const spaPatchSpec: Record<string, FieldSpec> = Object.fromEntries(
  Object.entries(spaBodySpec).map(([k, s]) => [k, { ...s, required: false }]),
);

/** Normalises the new listing fields: valid enum members only, URL-shaped links only.
    Array fields absent from the payload keep their stored value (partial update). */
const spaTaxonomyPatch = (v: Record<string, any>, spa?: any) => {
  const website = String(v.website ?? '').trim();
  const mapsUrl = String(v.mapsUrl ?? '').trim();
  return {
    phone: String(v.phone ?? '').trim().slice(0, 40),
    email: v.email ? String(v.email).toLowerCase().trim().slice(0, 254) : (spa?.email ?? ''),
    website: /^https?:\/\//i.test(website) ? website.slice(0, 300) : (spa?.website ?? ''),
    mapsUrl: /^https:\/\/([a-z0-9-]+\.)?google\.[a-z]{2,}/i.test(mapsUrl) ? mapsUrl.slice(0, 500) : (spa?.maps_url ?? ''),
    spaCategories: v.spaCategories !== undefined
      ? onlyValid(v.spaCategories, SPA_CATEGORIES, 6)
      : parse<string[]>(spa?.spa_categories, []),
    spaTypes: v.spaTypes !== undefined
      ? onlyValid(v.spaTypes, SPA_TYPES, 14)
      : parse<string[]>(spa?.spa_types, []),
    genre: GENRES.includes(v.genre) ? v.genre : (spa?.genre ?? 'both'),
    doorstep: v.doorstep === undefined ? (spa ? !!spa.doorstep : false) : !!v.doorstep,
  };
};

supplierRoutes.post('/spas', async (c) => {
  const user = approvedSupplier(c);
  const body = await c.req.json().catch(() => null);
  const v = validate(body, spaBodySpec);
  const base = slugify(v.name);
  let slug = base;
  for (let i = 1; await c.env.DB.prepare('SELECT 1 AS x FROM spas WHERE slug = ?').bind(slug).first(); i++) slug = `${base}-${i}`;

  const tax = spaTaxonomyPatch(v);
  const id = `spa_${randomToken(10)}`;
  const hours = JSON.stringify(Array.from({ length: 7 }, (_, d) => ({ open: '09:00', close: '20:00', closed: d === 6 })));
  await c.env.DB
    .prepare(`INSERT INTO spas (id, supplier_id, slug, name, destination, city, country, address, summary, description, image, gallery, facilities, categories, price_level, rating, review_count, featured, lat, lng, hours, phone, email, website, maps_url, spa_categories, spa_types, genre, doorstep, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`)
    .bind(id, user.supplier_id, slug, v.name, v.destination, v.city, v.country, v.address, v.summary,
      JSON.stringify(v.description?.length ? v.description : [v.summary]), v.image ?? '/images/spa/aurora-lounge.jpg',
      JSON.stringify(v.gallery ?? []), JSON.stringify(v.facilities ?? []), JSON.stringify(v.categories ?? ['massage']),
      v.priceLevel ?? 3, v.lat ?? null, v.lng ?? null, hours,
      tax.phone, tax.email, tax.website, tax.mapsUrl,
      JSON.stringify(tax.spaCategories), JSON.stringify(tax.spaTypes), tax.genre, tax.doorstep ? 1 : 0,
      nowIso(), nowIso())
    .run();

  // default weekly hours + a starter treatment so the listing is bookable after approval
  const inserts = Array.from({ length: 7 }, (_, d) =>
    c.env.DB.prepare('INSERT INTO availability_rules (id, spa_id, day_of_week, open_time, close_time, closed) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(newId('avl'), id, d, '09:00', '20:00', d === 6 ? 1 : 0));
  await c.env.DB.batch(inserts);

  const admins = await c.env.DB.prepare("SELECT id FROM users WHERE role = 'admin'").all<{ id: string }>();
  for (const a of admins.results) await notify(c.env, a.id, 'spa', 'New listing submitted', `${v.name} is awaiting approval`, '/admin?tab=spas');
  return c.json({ id, slug, status: 'pending' }, 201);
});

const ownSpa = async (c: Context<AppEnv>, user: SessionUser, spaId: string) => {
  const spa = await c.env.DB.prepare('SELECT * FROM spas WHERE id = ?').bind(spaId).first<any>();
  if (!spa) throw new ApiError(404, 'Spa not found', 'not_found');
  ownsSupplier(user, spa.supplier_id);
  return spa;
};

supplierRoutes.patch('/spas/:id', async (c) => {
  const user = approvedSupplier(c);
  const spa = await ownSpa(c, user, c.req.param('id'));
  const body = await c.req.json().catch(() => null);
  const v = validate(body, spaPatchSpec);
  // validate() substitutes [] for absent array fields — restore "absent" so a
  // partial payload keeps the stored values instead of wiping them.
  for (const key of ['gallery', 'facilities', 'categories', 'description', 'spaCategories', 'spaTypes']) {
    if (!Array.isArray((body as Record<string, unknown>)?.[key])) delete v[key];
  }
  const cover = v.image ?? spa.image;
  const gallery = (v.gallery ?? parse<string[]>(spa.gallery, [])).filter(Boolean);
  const tax = spaTaxonomyPatch(v, spa);
  await c.env.DB
    .prepare(`UPDATE spas SET name = ?, destination = ?, city = ?, country = ?, address = ?, summary = ?, image = ?,
              gallery = ?, facilities = ?, categories = ?, description = ?, price_level = ?, lat = ?, lng = ?,
              phone = ?, email = ?, website = ?, maps_url = ?, spa_categories = ?, spa_types = ?, genre = ?, doorstep = ?,
              updated_at = ? WHERE id = ?`)
    .bind(v.name ?? spa.name, v.destination ?? spa.destination, v.city ?? spa.city,
      v.country ?? spa.country, v.address ?? spa.address, v.summary ?? spa.summary, cover,
      JSON.stringify(gallery),
      JSON.stringify(v.facilities ?? parse<string[]>(spa.facilities, [])),
      JSON.stringify(v.categories ?? parse<string[]>(spa.categories, [])),
      JSON.stringify(v.description ?? parse<string[]>(spa.description, [])),
      v.priceLevel ?? spa.price_level, v.lat ?? spa.lat, v.lng ?? spa.lng,
      tax.phone || spa.phone || '', tax.email, tax.website, tax.mapsUrl,
      JSON.stringify(tax.spaCategories), JSON.stringify(tax.spaTypes), tax.genre, tax.doorstep ? 1 : 0,
      nowIso(), spa.id)
    .run();

  // Uploaded images this save no longer references (old cover or removed
  // gallery entries) are collected here so replaced uploads don't accumulate.
  const refs = [...new Set([cover, ...gallery])]
    .map((s) => /^\/api\/img\/(img_[A-Za-z0-9_-]+)$/.exec(String(s))?.[1])
    .filter((id): id is string => !!id);
  const notIn = refs.length ? ` AND id NOT IN (${refs.map(() => '?').join(',')})` : '';
  await c.env.DB.prepare(`DELETE FROM listing_images WHERE spa_id = ?${notIn}`).bind(spa.id, ...refs).run();

  return c.json({ ok: true, status: spa.status });
});

/* ---------- uploaded listing images (cover + gallery) ---------- */

// D1 caps a row at 2 MB — decoded uploads stay well under it. The client
// downscales photos before sending; this is the server-side hard limit.
const MAX_IMAGE_BYTES = 700_000;
const MAX_IMAGES_PER_SPA = 30; // gallery cap is 12 + cover + replacement slack

const sniffImageMime = (b: Uint8Array): string | null => {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  if (b.length > 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif';
  return null; // SVG and anything unrecognised are rejected — images are served same-origin
};

supplierRoutes.post('/spas/:id/images', async (c) => {
  const user = approvedSupplier(c);
  const spa = await ownSpa(c, user, c.req.param('id'));

  const rl = await rateLimit(c.env.DB, 'image-upload', c.var.ip, 30, 60_000);
  if (!rl.ok) throw new ApiError(429, `Too many uploads — retry in ${rl.retryAfterSec}s`, 'rate_limited');

  const body = await c.req.json().catch(() => null);
  const dataUrl = typeof body?.dataUrl === 'string' ? body.dataUrl : '';
  if (dataUrl.length > 1_000_000) throw new ApiError(413, 'Image is too large — 700 KB maximum', 'too_large');
  const m = /^data:image\/(?:jpeg|png|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!m) throw new ApiError(400, 'Send a base64 data URL of a JPEG, PNG, WebP or GIF image', 'validation');

  const bytes = Uint8Array.from(atob(m[1]), (ch) => ch.charCodeAt(0));
  if (bytes.length > MAX_IMAGE_BYTES) throw new ApiError(413, 'Image is too large — 700 KB maximum', 'too_large');
  const mime = sniffImageMime(bytes);
  if (!mime) throw new ApiError(400, 'Unsupported image — use a JPEG, PNG, WebP or GIF (SVG is not allowed)', 'validation');

  const count = await c.env.DB.prepare('SELECT COUNT(*) AS c FROM listing_images WHERE spa_id = ?')
    .bind(spa.id).first<{ c: number }>();
  if (Number(count?.c ?? 0) >= MAX_IMAGES_PER_SPA)
    throw new ApiError(409, `This listing already has ${MAX_IMAGES_PER_SPA} uploaded images — remove some first`, 'image_limit');

  const id = `img_${randomToken(12)}`;
  await c.env.DB
    .prepare('INSERT INTO listing_images (id, spa_id, mime, data, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, spa.id, mime, bytes, nowIso())
    .run();
  return c.json({ id, url: `/api/img/${id}`, mime }, 201);
});

supplierRoutes.delete('/spas/:id', async (c) => {
  const user = approvedSupplier(c);
  const spa = await ownSpa(c, user, c.req.param('id'));
  const future = await c.env.DB
    .prepare("SELECT COUNT(*) AS c FROM bookings WHERE spa_id = ? AND status IN ('pending','confirmed') AND booking_date >= ?")
    .bind(spa.id, nowIso().slice(0, 10)).first<any>();
  if (Number(future?.c ?? 0) > 0) throw new ApiError(409, 'Cancel upcoming bookings before removing this listing', 'has_bookings');
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM staff WHERE spa_id = ?').bind(spa.id),
    c.env.DB.prepare('DELETE FROM offers WHERE spa_id = ?').bind(spa.id),
    c.env.DB.prepare('DELETE FROM listing_images WHERE spa_id = ?').bind(spa.id),
    c.env.DB.prepare('DELETE FROM spas WHERE id = ?').bind(spa.id),
  ]);
  return c.json({ ok: true });
});

/* ---------- treatments & packages ---------- */

supplierRoutes.get('/spas/:id/catalog', async (c) => {
  const user = approvedSupplier(c);
  const spa = await ownSpa(c, user, c.req.param('id'));
  const [t, p, hours, blocked] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT * FROM treatments WHERE spa_id = ? ORDER BY price').bind(spa.id),
    c.env.DB.prepare('SELECT * FROM packages WHERE spa_id = ? ORDER BY price').bind(spa.id),
    c.env.DB.prepare('SELECT day_of_week, open_time, close_time, closed FROM availability_rules WHERE spa_id = ?').bind(spa.id),
    c.env.DB.prepare('SELECT id, blocked_date, reason FROM blocked_dates WHERE spa_id = ? ORDER BY blocked_date DESC LIMIT 60').bind(spa.id),
  ]) as any[];
  return c.json({
    treatments: t.results, packages: p.results,
    hours: hours.results, blocked: blocked.results,
  });
});

supplierRoutes.post('/spas/:id/treatments', async (c) => {
  const user = approvedSupplier(c);
  const spa = await ownSpa(c, user, c.req.param('id'));
  const body = await c.req.json().catch(() => null);
  const v = validate(body, {
    name: { required: true, min: 3, max: 100 },
    category: { enum: ['massage', 'skincare', 'body', 'thermal', 'hydro', 'wellness'] },
    description: { max: 1000 },
    descriptionHtml: { max: 12000 },
    durationMin: { type: 'int', min: 15, max: 480 },
    durations: { type: 'array' as const, max: 8 },
    spaType: { enum: [...SPA_TYPES] },
    genre: { enum: [...GENRES] },
    delivery: { enum: [...DELIVERY_TYPES] },
    price: { required: true, type: 'number', min: 1, max: 100000 },
    image: { max: 300 },
    active: { type: 'boolean' },
  });

  const html = sanitizeRichHtml(v.descriptionHtml ?? '');
  const plain = richTextToPlain(html) || String(v.description ?? '').slice(0, 1000);
  const durations = normalizeDurations(v.durations, v.durationMin);
  if (!durations.length && !v.durationMin) throw new ApiError(400, 'Add at least one duration option', 'validation');
  const category = v.category ?? (v.spaType ? legacyCategoryFor(v.spaType) : 'wellness');

  const slug = slugify(v.name);
  const dupe = await c.env.DB.prepare('SELECT 1 AS x FROM treatments WHERE spa_id = ? AND slug = ?').bind(spa.id, slug).first();
  if (dupe) throw new ApiError(409, 'You already offer a treatment with this name', 'duplicate');
  const id = newId('trt');
  await c.env.DB
    .prepare(`INSERT INTO treatments (id, spa_id, slug, name, category, description, description_html, duration_min, durations, spa_type, genre, delivery, price, image, active, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, spa.id, slug, v.name, category, plain, html,
      durations[0] ?? v.durationMin, JSON.stringify(durations),
      v.spaType ?? '', v.genre ?? 'both', v.delivery ?? 'both',
      money(v.price), v.image ?? '/images/treatment/signature-massage.jpg', v.active === false ? 0 : 1, nowIso())
    .run();
  return c.json({ id, slug }, 201);
});

supplierRoutes.patch('/treatments/:id', async (c) => {
  const user = approvedSupplier(c);
  const row = await c.env.DB.prepare('SELECT * FROM treatments WHERE id = ?').bind(c.req.param('id')).first<any>();
  if (!row) throw new ApiError(404, 'Treatment not found', 'not_found');
  const spa = await ownSpa(c, user, row.spa_id);
  void spa;
  const body = await c.req.json().catch(() => null);
  const v = validate(body, {
    name: { min: 3, max: 100 }, category: { enum: ['massage', 'skincare', 'body', 'thermal', 'hydro', 'wellness'] },
    description: { max: 1000 }, descriptionHtml: { max: 12000 },
    durationMin: { type: 'int', min: 15, max: 480 }, durations: { type: 'array' as const, max: 8 },
    spaType: { enum: [...SPA_TYPES] }, genre: { enum: [...GENRES] }, delivery: { enum: [...DELIVERY_TYPES] },
    price: { type: 'number', min: 1, max: 100000 }, image: { max: 300 }, active: { type: 'boolean' },
  });

  // Rich text (when sent) replaces both the HTML and its plain-text shadow;
  // otherwise the legacy plain description keeps standing.
  const html = v.descriptionHtml !== undefined ? sanitizeRichHtml(v.descriptionHtml) : (row.description_html ?? '');
  const plain = v.descriptionHtml !== undefined
    ? (richTextToPlain(html) || String(v.description ?? '').slice(0, 1000) || row.description)
    : (v.description ?? row.description);
  const durations = v.durations !== undefined
    ? normalizeDurations(v.durations, v.durationMin ?? row.duration_min)
    : parse<number[]>(row.durations, []);
  const category = v.category
    ?? (v.spaType ? legacyCategoryFor(v.spaType) : row.category);

  await c.env.DB
    .prepare(`UPDATE treatments SET name = ?, category = ?, description = ?, description_html = ?, duration_min = ?, durations = ?,
              spa_type = ?, genre = ?, delivery = ?, price = ?, image = ?, active = ? WHERE id = ?`)
    .bind(v.name ?? row.name, category, plain, html,
      durations[0] ?? v.durationMin ?? row.duration_min, JSON.stringify(durations),
      v.spaType ?? row.spa_type, v.genre ?? row.genre, v.delivery ?? row.delivery,
      v.price != null ? money(v.price) : row.price, v.image ?? row.image,
      v.active === undefined ? row.active : v.active ? 1 : 0, row.id)
    .run();
  return c.json({ ok: true });
});

supplierRoutes.delete('/treatments/:id', async (c) => {
  const user = approvedSupplier(c);
  const row = await c.env.DB.prepare('SELECT spa_id FROM treatments WHERE id = ?').bind(c.req.param('id')).first<any>();
  if (!row) throw new ApiError(404, 'Treatment not found', 'not_found');
  await ownSpa(c, user, row.spa_id);
  const used = await c.env.DB.prepare("SELECT COUNT(*) AS c FROM bookings WHERE item_slug = (SELECT slug FROM treatments WHERE id = ?) AND status IN ('pending','confirmed')").bind(c.req.param('id')).first<any>();
  if (Number(used?.c ?? 0) > 0) {
    await c.env.DB.prepare('UPDATE treatments SET active = 0 WHERE id = ?').bind(c.req.param('id')).run();
    return c.json({ ok: true, deactivated: true });
  }
  await c.env.DB.prepare('DELETE FROM treatments WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

supplierRoutes.post('/spas/:id/packages', async (c) => {
  const user = approvedSupplier(c);
  const spa = await ownSpa(c, user, c.req.param('id'));
  const body = await c.req.json().catch(() => null);
  const v = validate(body, {
    name: { required: true, min: 3, max: 100 },
    description: { max: 600 },
    includes: { type: 'array', max: 12 },
    durationMin: { required: true, type: 'int', min: 30, max: 1440 },
    spaTypes: { type: 'array', max: 14 },
    genre: { enum: [...GENRES] },
    delivery: { enum: [...DELIVERY_TYPES] },
    price: { required: true, type: 'number', min: 1, max: 100000 },
    image: { max: 300 },
    active: { type: 'boolean' },
  });
  const slug = slugify(v.name);
  const id = newId('pkg');
  await c.env.DB
    .prepare(`INSERT INTO packages (id, spa_id, slug, name, description, includes, duration_min, spa_types, genre, delivery, price, image, active, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, spa.id, slug, v.name, v.description ?? '', JSON.stringify(v.includes ?? []), v.durationMin,
      JSON.stringify(onlyValid(v.spaTypes, SPA_TYPES, 14)), v.genre ?? 'both', v.delivery ?? 'both',
      money(v.price), v.image ?? '/images/package/retreat-day.jpg', v.active === false ? 0 : 1, nowIso())
    .run();
  return c.json({ id, slug }, 201);
});

supplierRoutes.patch('/packages/:id', async (c) => {
  const user = approvedSupplier(c);
  const row = await c.env.DB.prepare('SELECT * FROM packages WHERE id = ?').bind(c.req.param('id')).first<any>();
  if (!row) throw new ApiError(404, 'Package not found', 'not_found');
  await ownSpa(c, user, row.spa_id);
  const body = await c.req.json().catch(() => null);
  const v = validate(body, {
    name: { min: 3, max: 100 }, description: { max: 600 }, includes: { type: 'array', max: 12 },
    durationMin: { type: 'int', min: 30, max: 1440 },
    spaTypes: { type: 'array', max: 14 }, genre: { enum: [...GENRES] }, delivery: { enum: [...DELIVERY_TYPES] },
    price: { type: 'number', min: 1, max: 100000 }, image: { max: 300 }, active: { type: 'boolean' },
  });
  await c.env.DB
    .prepare(`UPDATE packages SET name = ?, description = ?, includes = ?, duration_min = ?, spa_types = ?, genre = ?, delivery = ?, price = ?, image = ?, active = ? WHERE id = ?`)
    .bind(v.name ?? row.name, v.description ?? row.description,
      JSON.stringify(v.includes ?? parse<string[]>(row.includes, [])), v.durationMin ?? row.duration_min,
      JSON.stringify(v.spaTypes !== undefined ? onlyValid(v.spaTypes, SPA_TYPES, 14) : parse<string[]>(row.spa_types, [])),
      v.genre ?? row.genre, v.delivery ?? row.delivery,
      v.price != null ? money(v.price) : row.price, v.image ?? row.image,
      v.active === undefined ? row.active : v.active ? 1 : 0, row.id)
    .run();
  return c.json({ ok: true });
});

supplierRoutes.delete('/packages/:id', async (c) => {
  const user = approvedSupplier(c);
  const row = await c.env.DB.prepare('SELECT spa_id FROM packages WHERE id = ?').bind(c.req.param('id')).first<any>();
  if (!row) throw new ApiError(404, 'Package not found', 'not_found');
  await ownSpa(c, user, row.spa_id);
  await c.env.DB.prepare('DELETE FROM packages WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

/* ---------- staff ---------- */

supplierRoutes.get('/spas/:id/staff', async (c) => {
  const user = approvedSupplier(c);
  const spa = await ownSpa(c, user, c.req.param('id'));
  const rows = await c.env.DB
    .prepare('SELECT * FROM staff WHERE spa_id = ? ORDER BY active DESC, name')
    .bind(spa.id)
    .all();
  return c.json({ items: rows.results });
});

supplierRoutes.post('/spas/:id/staff', async (c) => {
  const user = approvedSupplier(c);
  const spa = await ownSpa(c, user, c.req.param('id'));
  const body = await c.req.json().catch(() => null);
  const v = validate(body, {
    name: { required: true, min: 2, max: 80 },
    role: { required: true, enum: ['admin', 'cashier', 'therapist', 'regular'] },
    phone: { max: 40 },
    email: { type: 'email', max: 120 },
    active: { type: 'boolean' },
    monthlySalary: { type: 'number', min: 0, max: 1000000 },
    incentivePercent: { type: 'number', min: 0, max: 100 },
    workFeePercent: { type: 'number', min: 0, max: 100 },
    posLogin: { type: 'boolean' },
  });
  const id = newId('stf');
  await c.env.DB
    .prepare(`INSERT INTO staff (id, spa_id, name, role, phone, email, active, monthly_salary, incentive_percent,
              work_fee_percent, pos_login, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, spa.id, v.name, v.role, v.phone || null, v.email || null, v.active === false ? 0 : 1,
      v.monthlySalary ?? null, v.incentivePercent ?? null,
      v.role === 'therapist' ? v.workFeePercent ?? null : null,
      ['admin', 'cashier'].includes(v.role) && v.posLogin === true ? 1 : 0, nowIso())
    .run();
  return c.json({ id }, 201);
});

supplierRoutes.patch('/staff/:id', async (c) => {
  const user = approvedSupplier(c);
  const row = await c.env.DB.prepare('SELECT * FROM staff WHERE id = ?').bind(c.req.param('id')).first<any>();
  if (!row) throw new ApiError(404, 'Team member not found', 'not_found');
  await ownSpa(c, user, row.spa_id);
  const body = await c.req.json().catch(() => null);
  const v = validate(body, {
    name: { min: 2, max: 80 }, role: { enum: ['admin', 'cashier', 'therapist', 'regular'] }, phone: { max: 40 },
    email: { type: 'email', max: 120 }, active: { type: 'boolean' },
    monthlySalary: { type: 'number', min: 0, max: 1000000 },
    incentivePercent: { type: 'number', min: 0, max: 100 },
    workFeePercent: { type: 'number', min: 0, max: 100 },
    posLogin: { type: 'boolean' },
  });
  // validate() maps blank values to undefined; read the raw body so an
  // explicitly-blank phone/email/salary clears the stored value instead of keeping it.
  const raw = (body ?? {}) as Record<string, unknown>;
  const optStr = (key: string, fallback: string | null) =>
    key in raw ? String(raw[key] ?? '').trim() || null : fallback;
  const optNum = (key: string, fallback: number | null) =>
    key in raw ? (v[key] ?? null) : fallback;
  const role = v.role ?? row.role;
  // Work/job fee belongs to therapists only; POS login belongs to admin/cashier only.
  const workFee = role === 'therapist' ? optNum('workFeePercent', row.work_fee_percent) : null;
  const posLogin = ['admin', 'cashier'].includes(role) &&
    (v.posLogin === undefined ? !!row.pos_login : v.posLogin) ? 1 : 0;
  await c.env.DB
    .prepare(`UPDATE staff SET name = ?, role = ?, phone = ?, email = ?, active = ?,
              monthly_salary = ?, incentive_percent = ?, work_fee_percent = ?, pos_login = ? WHERE id = ?`)
    .bind(v.name ?? row.name, role, optStr('phone', row.phone), optStr('email', row.email),
      v.active === undefined ? row.active : v.active ? 1 : 0,
      optNum('monthlySalary', row.monthly_salary), optNum('incentivePercent', row.incentive_percent),
      workFee, posLogin, row.id)
    .run();
  return c.json({ ok: true });
});

supplierRoutes.delete('/staff/:id', async (c) => {
  const user = approvedSupplier(c);
  const row = await c.env.DB.prepare('SELECT spa_id FROM staff WHERE id = ?').bind(c.req.param('id')).first<any>();
  if (!row) throw new ApiError(404, 'Team member not found', 'not_found');
  await ownSpa(c, user, row.spa_id);
  await c.env.DB.prepare('DELETE FROM staff WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

/* ---------- spa promotions (listing-scoped offers) ---------- */

supplierRoutes.get('/spas/:id/offers', async (c) => {
  const user = approvedSupplier(c);
  const spa = await ownSpa(c, user, c.req.param('id'));
  const rows = await c.env.DB
    .prepare('SELECT * FROM offers WHERE spa_id = ? ORDER BY active DESC, ends_at DESC')
    .bind(spa.id)
    .all();
  return c.json({ items: rows.results });
});

supplierRoutes.post('/spas/:id/offers', async (c) => {
  const user = approvedSupplier(c);
  const spa = await ownSpa(c, user, c.req.param('id'));
  const body = await c.req.json().catch(() => null);
  const v = validate(body, {
    code: { required: true, min: 3, max: 30 },
    title: { required: true, min: 3, max: 120 },
    description: { max: 300 },
    discountType: { required: true, enum: ['percent', 'fixed'] },
    value: { required: true, type: 'number', min: 1, max: 10000 },
    minSpend: { type: 'number', min: 0, max: 100000 },
    startsAt: { required: true, type: 'date' },
    endsAt: { required: true, type: 'date' },
    active: { type: 'boolean' },
  });
  if (v.endsAt < v.startsAt) throw new ApiError(400, 'End date must be after start date', 'validation');
  const code = v.code.toUpperCase();
  const dupe = await c.env.DB.prepare('SELECT 1 AS x FROM offers WHERE code = ?').bind(code).first();
  if (dupe) throw new ApiError(409, 'That code already exists', 'duplicate');
  const id = newId('off');
  await c.env.DB
    .prepare(`INSERT INTO offers (id, code, title, description, discount_type, value, min_spend, destination,
              starts_at, ends_at, image, active, spa_id) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`)
    .bind(id, code, v.title, v.description ?? '', v.discountType, v.value, v.minSpend ?? 0,
      v.startsAt, v.endsAt, '/images/treatment/signature-massage.jpg', v.active === false ? 0 : 1, spa.id)
    .run();
  return c.json({ id, code }, 201);
});

supplierRoutes.patch('/offers/:id', async (c) => {
  const user = approvedSupplier(c);
  const row = await c.env.DB.prepare('SELECT * FROM offers WHERE id = ?').bind(c.req.param('id')).first<any>();
  // Global (admin-created) promos have no spa_id and are not supplier-editable.
  if (!row || !row.spa_id) throw new ApiError(404, 'Promotion not found', 'not_found');
  await ownSpa(c, user, row.spa_id);
  const body = await c.req.json().catch(() => null);
  const v = validate(body, {
    title: { min: 3, max: 120 }, description: { max: 300 }, discountType: { enum: ['percent', 'fixed'] },
    value: { type: 'number', min: 1, max: 10000 }, minSpend: { type: 'number', min: 0, max: 100000 },
    startsAt: { type: 'date' }, endsAt: { type: 'date' }, active: { type: 'boolean' },
  });
  const starts = v.startsAt ?? row.starts_at;
  const ends = v.endsAt ?? row.ends_at;
  if (ends < starts) throw new ApiError(400, 'End date must be after start date', 'validation');
  await c.env.DB
    .prepare('UPDATE offers SET title = ?, description = ?, discount_type = ?, value = ?, min_spend = ?, starts_at = ?, ends_at = ?, active = ? WHERE id = ?')
    .bind(v.title ?? row.title, v.description ?? row.description, v.discountType ?? row.discount_type,
      v.value ?? row.value, v.minSpend ?? row.min_spend, starts, ends,
      v.active === undefined ? row.active : v.active ? 1 : 0, row.id)
    .run();
  return c.json({ ok: true });
});

supplierRoutes.delete('/offers/:id', async (c) => {
  const user = approvedSupplier(c);
  const row = await c.env.DB.prepare('SELECT spa_id FROM offers WHERE id = ?').bind(c.req.param('id')).first<any>();
  if (!row || !row.spa_id) throw new ApiError(404, 'Promotion not found', 'not_found');
  await ownSpa(c, user, row.spa_id);
  await c.env.DB.prepare('DELETE FROM offers WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

/* ---------- availability management ---------- */

supplierRoutes.put('/spas/:id/hours', async (c) => {
  const user = approvedSupplier(c);
  const spa = await ownSpa(c, user, c.req.param('id'));
  const body = await c.req.json().catch(() => null);
  const hours = Array.isArray(body?.hours) ? body.hours : null;
  if (!hours || hours.length !== 7) throw new ApiError(400, 'Provide exactly 7 daily hours entries', 'validation');
  const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
  const clean: any[] = [];
  for (const [i, raw] of hours.entries()) {
    const entry = raw ?? {};
    const closed = !!entry.closed;
    const open = String(entry.open ?? '09:00');
    const close = String(entry.close ?? '20:00');
    if (!closed && (!TIME.test(open) || !TIME.test(close))) throw new ApiError(400, `Invalid hours for day ${i + 1}`, 'validation');
    if (!closed && close <= open) throw new ApiError(400, `Closing time must be after opening on day ${i + 1}`, 'validation');
    clean.push({ open, close, closed });
  }
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM availability_rules WHERE spa_id = ?').bind(spa.id),
    c.env.DB.prepare('UPDATE spas SET hours = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(clean), nowIso(), spa.id),
    ...clean.map((day, i) =>
      c.env.DB.prepare('INSERT INTO availability_rules (id, spa_id, day_of_week, open_time, close_time, closed) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(newId('avl'), spa.id, i, day.open, day.close, day.closed ? 1 : 0)),
  ]);
  return c.json({ ok: true });
});

supplierRoutes.post('/spas/:id/blocked-dates', async (c) => {
  const user = approvedSupplier(c);
  const spa = await ownSpa(c, user, c.req.param('id'));
  const body = await c.req.json().catch(() => null);
  const v = validate(body, { date: { required: true, type: 'date' }, reason: { max: 120 } });
  await c.env.DB
    .prepare('INSERT OR IGNORE INTO blocked_dates (id, spa_id, blocked_date, reason) VALUES (?, ?, ?, ?)')
    .bind(newId('blk'), spa.id, v.date, v.reason ?? 'Closed')
    .run();
  await c.env.DB
    .prepare("UPDATE bookings SET status = 'cancelled', cancel_reason = 'Spa closed on this date', cancelled_at = ?, updated_at = ? WHERE spa_id = ? AND booking_date = ? AND status IN ('pending','confirmed')")
    .bind(nowIso(), nowIso(), spa.id, v.date).run();
  return c.json({ ok: true }, 201);
});

supplierRoutes.delete('/spas/:id/blocked-dates/:date', async (c) => {
  const user = approvedSupplier(c);
  const spa = await ownSpa(c, user, c.req.param('id'));
  await c.env.DB.prepare('DELETE FROM blocked_dates WHERE spa_id = ? AND blocked_date = ?').bind(spa.id, c.req.param('date')).run();
  return c.json({ ok: true });
});

/* ---------- bookings ---------- */

supplierRoutes.get('/bookings', async (c) => {
  const user = approvedSupplier(c);
  const status = c.req.query('status');
  const date = c.req.query('date');
  const spa = c.req.query('spa');
  const where = ['s.supplier_id = ?'];
  const binds: unknown[] = [user.supplier_id];
  if (status && status !== 'all') { where.push('b.status = ?'); binds.push(status); }
  if (date) { where.push('b.booking_date = ?'); binds.push(date); }
  if (spa) { where.push('b.spa_id = ?'); binds.push(spa); }
  const rows = await c.env.DB
    .prepare(`SELECT b.*, s.name AS spa_name, s.slug AS spa_slug, s.city AS spa_city, s.image AS spa_image, s.address AS spa_address,
                     u.name AS customer_name, u.email AS customer_email, u.phone AS customer_phone
              FROM bookings b JOIN spas s ON s.id = b.spa_id JOIN users u ON u.id = b.customer_id
              WHERE ${where.join(' AND ')} ORDER BY b.booking_date DESC, b.start_time DESC LIMIT 200`)
    .bind(...binds)
    .all();
  return c.json({ items: rows.results });
});

supplierRoutes.patch('/bookings/:code', async (c) => {
  const user = approvedSupplier(c);
  const code = c.req.param('code');
  const body = await c.req.json().catch(() => null);
  const v = validate(body, { status: { required: true, enum: ['confirmed', 'rejected', 'completed', 'cancelled'] }, reason: { max: 300 } });

  const booking = await c.env.DB
    .prepare(`SELECT b.*, u.email AS customer_email, u.name AS customer_name, u.id AS customer_user
              FROM bookings b JOIN spas s ON s.id = b.spa_id JOIN users u ON u.id = b.customer_id
              WHERE b.code = ? AND s.supplier_id = ?`)
    .bind(code, user.supplier_id)
    .first<any>();
  if (!booking) throw new ApiError(404, 'Booking not found', 'not_found');

  const allowed: Record<string, string[]> = {
    pending: ['confirmed', 'rejected', 'cancelled'],
    confirmed: ['completed', 'cancelled'],
    completed: [],
    cancelled: [],
    rejected: ['confirmed'],
  };
  if (!allowed[booking.status]?.includes(v.status)) {
    throw new ApiError(409, `Cannot move a ${booking.status} booking to ${v.status}`, 'invalid_transition');
  }

  const refund = v.status === 'rejected' && booking.payment_status === 'paid';
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE bookings SET status = ?, cancel_reason = ?, cancelled_at = ?, updated_at = ? WHERE id = ?')
      .bind(v.status, refund ? v.reason ?? 'Rejected by spa' : booking.cancel_reason,
        ['rejected', 'cancelled'].includes(v.status) ? nowIso() : null, nowIso(), booking.id),
    ...(refund
      ? [
          c.env.DB.prepare("UPDATE bookings SET payment_status = 'refunded' WHERE id = ?").bind(booking.id),
          c.env.DB.prepare("UPDATE payments SET status = 'refunded' WHERE booking_id = ? AND status = 'succeeded'").bind(booking.id),
        ]
      : []),
  ]);

  const label: Record<string, string> = {
    confirmed: 'confirmed', rejected: 'rejected (refunded)', completed: 'marked complete', cancelled: 'cancelled',
  };
  await notify(c.env, booking.customer_user, 'booking', `Booking ${booking.code} ${label[v.status]}`,
    `${booking.item_name} · ${booking.booking_date} ${booking.start_time}`, '/login');
  await sendEmail(c.env, booking.customer_email, `Your booking ${booking.code} is ${label[v.status]}`,
    emailLayout(`Booking ${label[v.status]}`, `
      <p>Hello ${h(booking.customer_name)},</p>
      <p>Your appointment <strong>${h(booking.item_name)}</strong> on ${h(booking.booking_date)} at ${h(booking.start_time)} has been <strong>${h(label[v.status])}</strong>.</p>
      <p>Booking code: ${h(booking.code)}</p>`));
  return c.json({ ok: true, status: v.status, refunded: refund });
});

/* ---------- earnings ---------- */

supplierRoutes.get('/earnings', async (c) => {
  const user = approvedSupplier(c);
  const settings = await getSettings(c.env.DB);
  const rows = await c.env.DB
    .prepare(`SELECT strftime('%Y-%m', b.booking_date) AS month,
                     COUNT(*) AS bookings,
                     COALESCE(SUM(b.total),0) AS gross,
                     COALESCE(SUM(b.commission),0) AS commission,
                     COALESCE(SUM(b.supplier_earning),0) AS net
              FROM bookings b JOIN spas s ON s.id = b.spa_id
              WHERE s.supplier_id = ? AND b.payment_status = 'paid' AND b.status IN ('confirmed','completed')
              GROUP BY month ORDER BY month DESC LIMIT 12`)
    .bind(user.supplier_id)
    .all();
  const upcoming = await c.env.DB
    .prepare(`SELECT b.code, b.item_name, b.booking_date, b.start_time, b.total, b.supplier_earning, b.status, s.name AS spa_name
              FROM bookings b JOIN spas s ON s.id = b.spa_id
              WHERE s.supplier_id = ? AND b.payment_status = 'paid' AND b.status IN ('pending','confirmed') AND b.booking_date >= ?
              ORDER BY b.booking_date ASC LIMIT 30`)
    .bind(user.supplier_id, nowIso().slice(0, 10))
    .all();
  return c.json({
    commissionPercent: num(settings.commission_percent, 15),
    months: rows.results,
    upcomingPayouts: upcoming.results,
  });
});
