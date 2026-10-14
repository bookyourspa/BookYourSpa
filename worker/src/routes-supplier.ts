import { Hono, type Context } from 'hono';
import type { AppEnv } from './types';
import { ApiError, validate, newId, nowIso, money, randomToken } from './util';
import { requireRole, ownsSupplier, type SessionUser } from './auth';
import { getSettings, num } from './db';
import { sendEmail, emailLayout, h, notify } from './email';

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

  const spaRows = await c.env.DB
    .prepare('SELECT id, slug, name, city, status, featured, rating, review_count, image FROM spas WHERE supplier_id = ? ORDER BY name')
    .bind(user.supplier_id)
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
    spas: spaRows.results.map((r: any) => ({ ...r, featured: !!r.featured })),
    recent,
  });
});

/* ---------- spa listings ---------- */

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
};

supplierRoutes.post('/spas', async (c) => {
  const user = approvedSupplier(c);
  const body = await c.req.json().catch(() => null);
  const v = validate(body, spaBodySpec);
  const base = slugify(v.name);
  let slug = base;
  for (let i = 1; await c.env.DB.prepare('SELECT 1 AS x FROM spas WHERE slug = ?').bind(slug).first(); i++) slug = `${base}-${i}`;

  const id = `spa_${randomToken(10)}`;
  const hours = JSON.stringify(Array.from({ length: 7 }, (_, d) => ({ open: '09:00', close: '20:00', closed: d === 6 })));
  await c.env.DB
    .prepare(`INSERT INTO spas (id, supplier_id, slug, name, destination, city, country, address, summary, description, image, gallery, facilities, categories, price_level, rating, review_count, featured, lat, lng, hours, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, 'pending', ?, ?)`)
    .bind(id, user.supplier_id, slug, v.name, v.destination, v.city, v.country, v.address, v.summary,
      JSON.stringify(v.description?.length ? v.description : [v.summary]), v.image ?? '/images/spa/aurora-lounge.jpg',
      JSON.stringify(v.gallery ?? []), JSON.stringify(v.facilities ?? []), JSON.stringify(v.categories ?? ['massage']),
      v.priceLevel ?? 3, v.lat ?? null, v.lng ?? null, hours, nowIso(), nowIso())
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
  const v = validate(body, spaBodySpec);
  await c.env.DB
    .prepare(`UPDATE spas SET name = ?, destination = ?, city = ?, country = ?, address = ?, summary = ?, image = ?,
              gallery = ?, facilities = ?, categories = ?, description = ?, price_level = ?, lat = ?, lng = ?, updated_at = ? WHERE id = ?`)
    .bind(v.name, v.destination, v.city, v.country, v.address, v.summary, v.image ?? spa.image,
      JSON.stringify(v.gallery ?? parse<string[]>(spa.gallery, [])),
      JSON.stringify(v.facilities ?? parse<string[]>(spa.facilities, [])),
      JSON.stringify(v.categories ?? parse<string[]>(spa.categories, [])),
      JSON.stringify(v.description ?? parse<string[]>(spa.description, [])),
      v.priceLevel ?? spa.price_level, v.lat ?? spa.lat, v.lng ?? spa.lng, nowIso(), spa.id)
    .run();
  return c.json({ ok: true, status: spa.status });
});

supplierRoutes.delete('/spas/:id', async (c) => {
  const user = approvedSupplier(c);
  const spa = await ownSpa(c, user, c.req.param('id'));
  const future = await c.env.DB
    .prepare("SELECT COUNT(*) AS c FROM bookings WHERE spa_id = ? AND status IN ('pending','confirmed') AND booking_date >= ?")
    .bind(spa.id, nowIso().slice(0, 10)).first<any>();
  if (Number(future?.c ?? 0) > 0) throw new ApiError(409, 'Cancel upcoming bookings before removing this listing', 'has_bookings');
  await c.env.DB.prepare('DELETE FROM spas WHERE id = ?').bind(spa.id).run();
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
    category: { required: true, enum: ['massage', 'skincare', 'body', 'thermal', 'hydro', 'wellness'] },
    description: { max: 1000 },
    durationMin: { required: true, type: 'int', min: 15, max: 480 },
    price: { required: true, type: 'number', min: 1, max: 100000 },
    image: { max: 300 },
    active: { type: 'boolean' },
  });
  const slug = slugify(v.name);
  const dupe = await c.env.DB.prepare('SELECT 1 AS x FROM treatments WHERE spa_id = ? AND slug = ?').bind(spa.id, slug).first();
  if (dupe) throw new ApiError(409, 'You already offer a treatment with this name', 'duplicate');
  const id = newId('trt');
  await c.env.DB
    .prepare('INSERT INTO treatments (id, spa_id, slug, name, category, description, duration_min, price, image, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, spa.id, slug, v.name, v.category, v.description ?? '', v.durationMin, money(v.price), v.image ?? '/images/treatment/signature-massage.jpg', v.active === false ? 0 : 1, nowIso())
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
    description: { max: 1000 }, durationMin: { type: 'int', min: 15, max: 480 },
    price: { type: 'number', min: 1, max: 100000 }, image: { max: 300 }, active: { type: 'boolean' },
  });
  await c.env.DB
    .prepare('UPDATE treatments SET name = ?, category = ?, description = ?, duration_min = ?, price = ?, image = ?, active = ? WHERE id = ?')
    .bind(v.name ?? row.name, v.category ?? row.category, v.description ?? row.description,
      v.durationMin ?? row.duration_min, v.price != null ? money(v.price) : row.price, v.image ?? row.image,
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
    price: { required: true, type: 'number', min: 1, max: 100000 },
    image: { max: 300 },
    active: { type: 'boolean' },
  });
  const slug = slugify(v.name);
  const id = newId('pkg');
  await c.env.DB
    .prepare('INSERT INTO packages (id, spa_id, slug, name, description, includes, duration_min, price, image, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, spa.id, slug, v.name, v.description ?? '', JSON.stringify(v.includes ?? []), v.durationMin, money(v.price), v.image ?? '/images/package/retreat-day.jpg', v.active === false ? 0 : 1, nowIso())
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
    durationMin: { type: 'int', min: 30, max: 1440 }, price: { type: 'number', min: 1, max: 100000 },
    image: { max: 300 }, active: { type: 'boolean' },
  });
  await c.env.DB
    .prepare('UPDATE packages SET name = ?, description = ?, includes = ?, duration_min = ?, price = ?, image = ?, active = ? WHERE id = ?')
    .bind(v.name ?? row.name, v.description ?? row.description,
      JSON.stringify(v.includes ?? parse<string[]>(row.includes, [])), v.durationMin ?? row.duration_min,
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
  const where = ['s.supplier_id = ?'];
  const binds: unknown[] = [user.supplier_id];
  if (status && status !== 'all') { where.push('b.status = ?'); binds.push(status); }
  if (date) { where.push('b.booking_date = ?'); binds.push(date); }
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
