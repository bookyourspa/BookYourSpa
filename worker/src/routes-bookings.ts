import { Hono, type Context } from 'hono';
import type { AppEnv } from './types';
import { ApiError, validate, newId, nowIso, money, bookingCode, randomToken } from './util';
import { requireRole, hashPassword, verifyPassword } from './auth';
import { getSlots, isDateValid, calcCommission, priceAfterPromo, parseTime, fmtTime } from './booking';
import { getSettings, num } from './db';
import { sendEmail, emailLayout, h, notify } from './email';
import { demoPayment, stripeCheckout, markBookingPaid, type BookingForPayment } from './payment';

export const bookingRoutes = new Hono<AppEnv>();

const SECURE = (origin?: string) => (origin ?? '').startsWith('https://');

const shapeBooking = (r: any, cancellationHours: number) => {
  const startMins = parseTime(r.start_time);
  const deadline = new Date(`${r.booking_date}T00:00:00Z`);
  deadline.setUTCMinutes(startMins - cancellationHours * 60);
  return {
    code: r.code, spa: { slug: r.spa_slug, name: r.spa_name, city: r.spa_city, image: r.spa_image, address: r.spa_address },
    itemType: r.item_type, itemSlug: r.item_slug, itemName: r.item_name, durationMin: r.duration_min,
    date: r.booking_date, startTime: r.start_time, endTime: r.end_time,
    amount: r.amount, discount: r.discount, total: r.total, currency: r.currency,
    status: r.status, paymentStatus: r.payment_status, paymentProvider: r.payment_provider,
    promoCode: r.promo_code, notes: r.notes, guestName: r.guest_name,
    createdAt: r.created_at, cancelDeadline: deadline.toISOString(),
    canCancel: r.status === 'pending' || r.status === 'confirmed',
  };
};

const BOOKING_SELECT = `b.*, s.name AS spa_name, s.slug AS spa_slug, s.city AS spa_city, s.image AS spa_image, s.address AS spa_address`;

/* ---------- create booking ---------- */

bookingRoutes.post('/bookings', async (c) => {
  const user = requireRole(c.var.user, ['customer']);
  const body = await c.req.json().catch(() => null);
  const v = validate(body, {
    spaSlug: { required: true, max: 120 },
    itemType: { required: true, enum: ['treatment', 'package'] },
    itemSlug: { required: true, max: 80 },
    date: { required: true, type: 'date' },
    time: { required: true, type: 'time' },
    notes: { max: 500 },
    guestName: { max: 80 },
    guestPhone: { max: 40 },
    promoCode: { max: 30 },
  });
  if (!isDateValid(v.date)) throw new ApiError(400, 'Choose a date within the next 120 days', 'validation');

  const spa = await c.env.DB
    .prepare("SELECT id, supplier_id, name, city FROM spas WHERE slug = ? AND status = 'approved'")
    .bind(v.spaSlug)
    .first<any>();
  if (!spa) throw new ApiError(404, 'Spa not found', 'not_found');

  const table = v.itemType === 'package' ? 'packages' : 'treatments';
  const item = await c.env.DB
    .prepare(`SELECT slug, name, duration_min, price FROM ${table} WHERE spa_id = ? AND slug = ? AND active = 1`)
    .bind(spa.id, v.itemSlug)
    .first<any>();
  if (!item) throw new ApiError(404, 'Treatment or package not found', 'not_found');

  const slots = await getSlots(c.env.DB, spa.id, v.date, item.duration_min);
  const slot = slots.find((s) => s.time === v.time);
  if (!slot || !slot.available) {
    throw new ApiError(409, 'That time has just been taken. Please choose another slot.', 'slot_unavailable');
  }

  const settings = await getSettings(c.env.DB);
  let promo: { discount_type: string; value: number; min_spend: number } | null = null;
  if (v.promoCode) {
    const row = await c.env.DB
      .prepare("SELECT discount_type, value, min_spend FROM offers WHERE code = ? AND active = 1 AND starts_at <= ? AND ends_at >= ?")
      .bind(v.promoCode.toUpperCase(), v.date, v.date)
      .first<any>();
    if (!row) throw new ApiError(400, 'That promo code is not valid for this date', 'invalid_promo');
    promo = row;
  }

  const base = money(Number(item.price));
  const { discount, total } = priceAfterPromo(base, promo);
  const commission = calcCommission(total, num(settings.commission_percent, 15));
  const endMins = parseTime(v.time) + item.duration_min;

  let code = bookingCode();
  for (let i = 0; i < 5; i++) {
    const clash = await c.env.DB.prepare('SELECT 1 AS x FROM bookings WHERE code = ?').bind(code).first();
    if (!clash) break;
    code = bookingCode();
  }
  const id = `bkg_${randomToken(12)}`;
  const now = nowIso();
  await c.env.DB
    .prepare(`INSERT INTO bookings (id, code, customer_id, spa_id, item_type, item_slug, item_name, duration_min,
        booking_date, start_time, end_time, amount, discount, total, commission, supplier_earning, currency,
        status, payment_status, promo_code, guest_name, guest_phone, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'unpaid', ?, ?, ?, ?, ?, ?)`)
    .bind(id, code, user.id, spa.id, v.itemType, item.slug, item.name, item.duration_min,
      v.date, v.time, fmtTime(endMins), base, discount, total, commission, money(total - commission),
      settings.currency ?? 'USD', v.promoCode ? v.promoCode.toUpperCase() : null,
      v.guestName ?? null, v.guestPhone ?? null, v.notes ?? null, now, now)
    .run();

  const supplierUser = await c.env.DB
    .prepare('SELECT s.user_id FROM suppliers s JOIN spas sp ON sp.supplier_id = s.id WHERE sp.id = ?')
    .bind(spa.id)
    .first<{ user_id: string }>();
  if (supplierUser) {
    await notify(c.env, supplierUser.user_id, 'booking', 'New booking request',
      `${item.name} · ${v.date} ${v.time} · code ${code}`, '/supplier');
  }
  await sendEmail(c.env, user.email, `Booking received — ${code}`,
    emailLayout('Booking received', `
      <p>Hello ${h(user.name)},</p>
      <p>We have held <strong>${h(item.name)}</strong> at <strong>${h(spa.name)}</strong>.</p>
      <p><strong>Code:</strong> ${h(code)}<br/><strong>When:</strong> ${h(v.date)} · ${h(v.time)}–${h(fmtTime(endMins))}<br/>
      <strong>Total:</strong> ${h(settings.currency ?? 'USD')} ${h(String(total))}</p>
      <p>Complete payment to confirm your appointment — the spa is notified the moment payment clears.</p>`));

  return c.json({
    booking: { code, date: v.date, startTime: v.time, endTime: fmtTime(endMins), itemName: item.name, spaName: spa.name, total, currency: settings.currency ?? 'USD', status: 'pending', paymentStatus: 'unpaid' },
    paymentMode: c.env.STRIPE_SECRET_KEY ? 'stripe' : 'demo',
  }, 201);
});

/* ---------- payment ---------- */

const loadOwnBooking = async (c: Context<AppEnv>, code: string) => {
  const user = requireRole(c.var.user, ['customer']);
  const row = await c.env.DB.prepare(`SELECT ${BOOKING_SELECT} FROM bookings b JOIN spas s ON s.id = b.spa_id WHERE b.code = ? AND b.customer_id = ?`)
    .bind(code, user.id)
    .first<any>();
  if (!row) throw new ApiError(404, 'Booking not found', 'not_found');
  return { user, row };
};

bookingRoutes.post('/bookings/:code/pay', async (c) => {
  const code = c.req.param('code');
  const { row } = await loadOwnBooking(c, code);
  if (row.payment_status === 'paid') return c.json({ alreadyPaid: true });
  if (row.status === 'cancelled' || row.status === 'rejected') throw new ApiError(409, 'This booking can no longer be paid', 'booking_closed');

  const body = await c.req.json().catch(() => ({}));
  const booking: BookingForPayment = {
    id: row.id, code: row.code, customer_id: row.customer_id, spa_id: row.spa_id,
    item_name: row.item_name, total: Number(row.total), currency: row.currency,
    commission: Number(row.commission), booking_date: row.booking_date, start_time: row.start_time,
  };

  if (c.env.STRIPE_SECRET_KEY) {
    const checkout = await stripeCheckout(c.env, booking);
    return c.json(checkout);
  }
  const v = validate(body, { cardNumber: { required: true, max: 25 } });
  const result = await demoPayment(c.env, booking, v.cardNumber);
  return c.json(result);
});

bookingRoutes.post('/payments/webhook', async (c) => {
  const payload = await c.req.text();
  const sig = c.req.header('stripe-signature') ?? '';
  const { handleStripeWebhook } = await import('./payment');
  return c.json(await handleStripeWebhook(c.env, payload, sig));
});

/* ---------- customer: bookings ---------- */

bookingRoutes.get('/bookings/mine', async (c) => {
  const user = requireRole(c.var.user, ['customer', 'admin', 'supplier']);
  const filter = c.req.query('filter') ?? 'upcoming';
  const settings = await getSettings(c.env.DB);
  const today = nowIso().slice(0, 10);
  const nowTime = nowIso().slice(11, 16);

  let cond = 'b.customer_id = ?';
  if (filter === 'upcoming') cond += ` AND b.status IN ('pending','confirmed') AND (b.booking_date > ? OR (b.booking_date = ? AND b.end_time >= ?))`;
  else if (filter === 'past') cond += ` AND (b.status IN ('completed','cancelled','rejected') OR b.booking_date < ? OR (b.booking_date = ? AND b.end_time < ?))`;

  const binds: unknown[] = filter === 'upcoming' ? [user.id, today, today, nowTime]
    : filter === 'past' ? [user.id, today, today, nowTime]
    : [user.id];

  const rows = await c.env.DB
    .prepare(`SELECT ${BOOKING_SELECT} FROM bookings b JOIN spas s ON s.id = b.spa_id WHERE ${cond} ORDER BY b.booking_date DESC, b.start_time DESC LIMIT 100`)
    .bind(...binds)
    .all();
  return c.json({ items: rows.results.map((r: any) => shapeBooking(r, num(settings.cancellation_hours, 24))) });
});

bookingRoutes.get('/bookings/summary', async (c) => {
  const user = requireRole(c.var.user, ['customer']);
  const today = nowIso().slice(0, 10);
  const [upcoming, past, spent] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT COUNT(*) AS c FROM bookings WHERE customer_id = ? AND status IN ('pending','confirmed') AND booking_date >= ?").bind(user.id, today),
    c.env.DB.prepare("SELECT COUNT(*) AS c FROM bookings WHERE customer_id = ? AND status IN ('completed','cancelled','rejected')").bind(user.id),
    c.env.DB.prepare("SELECT COALESCE(SUM(total),0) AS s FROM bookings WHERE customer_id = ? AND payment_status = 'paid' AND status != 'cancelled'").bind(user.id),
  ]);
  const u = upcoming.results[0] as any;
  const p = past.results[0] as any;
  const sp = spent.results[0] as any;
  return c.json({
    upcoming: Number(u?.c ?? 0),
    past: Number(p?.c ?? 0),
    spent: money(Number(sp?.s ?? 0)),
  });
});

bookingRoutes.post('/bookings/:code/cancel', async (c) => {
  const code = c.req.param('code');
  const { user, row } = await loadOwnBooking(c, code);
  if (!['pending', 'confirmed'].includes(row.status)) throw new ApiError(409, 'This booking can no longer be cancelled', 'booking_closed');

  const settings = await getSettings(c.env.DB);
  const hours = num(settings.cancellation_hours, 24);
  const deadline = new Date(`${row.booking_date}T00:00:00Z`);
  deadline.setUTCMinutes(parseTime(row.start_time) - hours * 60);
  if (Date.now() > deadline.getTime()) {
    throw new ApiError(409, `Free cancellation ended ${hours}h before the appointment. Contact the spa directly.`, 'too_late');
  }

  const body = await c.req.json().catch(() => ({}));
  const v = validate(body, { reason: { max: 300 } });
  const refund = row.payment_status === 'paid';
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE bookings SET status = 'cancelled', cancel_reason = ?, cancelled_at = ?, updated_at = ? WHERE id = ?")
      .bind(v.reason ?? 'Cancelled by customer', nowIso(), nowIso(), row.id),
    ...(refund
      ? [
          c.env.DB.prepare("UPDATE bookings SET payment_status = 'refunded' WHERE id = ?").bind(row.id),
          c.env.DB.prepare("UPDATE payments SET status = 'refunded' WHERE booking_id = ? AND status = 'succeeded'").bind(row.id),
        ]
      : []),
  ]);

  const supplierUser = await c.env.DB
    .prepare('SELECT s.user_id FROM suppliers s JOIN spas sp ON sp.supplier_id = s.id WHERE sp.id = ?')
    .bind(row.spa_id).first<{ user_id: string }>();
  if (supplierUser) await notify(c.env, supplierUser.user_id, 'booking', `Booking ${code} cancelled`, `${row.item_name} · ${row.booking_date} ${row.start_time}`, '/supplier');
  await notify(c.env, user.id, 'booking', 'Booking cancelled', `${row.item_name} has been cancelled${refund ? ' and refunded' : ''}.`, '/login');
  await sendEmail(c.env, user.email, `Booking ${code} cancelled`,
    emailLayout('Booking cancelled', `<p>Hello ${h(user.name)},</p><p><strong>${h(row.item_name)}</strong> on ${h(row.booking_date)} at ${h(row.start_time)} has been cancelled.${refund ? ' Your payment will be refunded in full within 5–10 business days.' : ''}</p>`));

  return c.json({ ok: true, refunded: refund });
});

/* ---------- profile / password / notifications / reviews ---------- */

bookingRoutes.patch('/me', async (c) => {
  const user = requireRole(c.var.user);
  const body = await c.req.json().catch(() => null);
  const v = validate(body, {
    name: { min: 2, max: 80 },
    phone: { max: 40 },
    password: { min: 8, max: 128 },
    currentPassword: { max: 128 },
  });
  let passwordHash: string | null = null;
  if (v.password) {
    const row = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id).first<any>();
    if (!v.currentPassword || !(await verifyPassword(v.currentPassword, row?.password_hash ?? ''))) {
      throw new ApiError(403, 'Current password is incorrect', 'invalid_credentials');
    }
    if (!/[a-zA-Z]/.test(v.password) || !/\d/.test(v.password)) {
      throw new ApiError(400, 'New password must contain letters and numbers', 'validation');
    }
    passwordHash = await hashPassword(v.password);
  }
  await c.env.DB
    .prepare('UPDATE users SET name = ?, phone = ?, password_hash = COALESCE(?, password_hash), updated_at = ? WHERE id = ?')
    .bind(v.name ?? user.name, v.phone ?? user.phone, passwordHash, nowIso(), user.id)
    .run();
  return c.json({ ok: true });
});

bookingRoutes.get('/me/notifications', async (c) => {
  const user = requireRole(c.var.user);
  const rows = await c.env.DB
    .prepare('SELECT id, type, title, body, link, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 40')
    .bind(user.id)
    .all();
  const unread = await c.env.DB.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0').bind(user.id).first<any>();
  return c.json({
    items: rows.results.map((r: any) => ({ ...r, isRead: !!r.is_read, createdAt: r.created_at })),
    unread: Number(unread?.c ?? 0),
  });
});

bookingRoutes.post('/me/notifications/read', async (c) => {
  const user = requireRole(c.var.user);
  const body = await c.req.json().catch(() => ({}));
  if (body.all === true) {
    await c.env.DB.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').bind(user.id).run();
  } else if (Array.isArray(body.ids) && body.ids.length) {
    const ids = body.ids.slice(0, 100).map(String);
    await c.env.DB.prepare(`UPDATE notifications SET is_read = 1 WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`).bind(user.id, ...ids).run();
  }
  return c.json({ ok: true });
});

/** Reviews may only be written by customers who completed a booking at that spa. */
bookingRoutes.post('/me/reviews', async (c) => {
  const user = requireRole(c.var.user, ['customer']);
  const body = await c.req.json().catch(() => null);
  const v = validate(body, {
    bookingCode: { required: true, max: 20 },
    rating: { required: true, type: 'int', min: 1, max: 5 },
    title: { max: 120 },
    body: { required: true, min: 10, max: 2000 },
  });
  const booking = await c.env.DB
    .prepare("SELECT id, spa_id, status FROM bookings WHERE code = ? AND customer_id = ? AND payment_status = 'paid'")
    .bind(v.bookingCode, user.id)
    .first<any>();
  if (!booking) throw new ApiError(403, 'Only completed bookings can be reviewed', 'not_allowed');
  if (booking.status !== 'completed') throw new ApiError(409, 'You can review once the appointment is completed', 'not_completed');
  const dupe = await c.env.DB.prepare('SELECT 1 AS x FROM reviews WHERE booking_id = ?').bind(booking.id).first();
  if (dupe) throw new ApiError(409, 'You have already reviewed this booking', 'duplicate');

  await c.env.DB
    .prepare('INSERT INTO reviews (id, spa_id, user_id, booking_id, name, city, rating, title, body, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(newId('rev'), booking.spa_id, user.id, booking.id, user.name, null, v.rating, v.title ?? '', v.body, 'pending', nowIso())
    .run();
  const admins = await c.env.DB.prepare("SELECT id FROM users WHERE role = 'admin'").all<{ id: string }>();
  for (const a of admins.results) await notify(c.env, a.id, 'review', 'New review awaiting moderation', `${user.name} left a ${v.rating}★ review`, '/admin?tab=reviews');
  return c.json({ ok: true, status: 'pending' }, 201);
});
