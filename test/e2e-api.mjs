/* End-to-end API tests against the local workerd server (wrangler dev on :8787). */
const BASE = process.env.BASE ?? 'http://127.0.0.1:8787';
let pass = 0, fail = 0;
const failures = [];
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; failures.push(name); console.log(`  ✗ ${name} ${extra}`); }
};

const jar = () => ({ cookie: '' });
async function req(path, { method = 'GET', body, jar: j, csrf = true, origin, raw } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (csrf) headers['x-bys-csrf'] = '1';
  if (j?.cookie) headers.cookie = j.cookie;
  if (origin) headers.origin = origin;
  const res = await fetch(BASE + path, {
    method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual',
  });
  const setCookie = res.headers.getSetCookie?.() ?? (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);
  if (j && setCookie.length) {
    for (const sc of setCookie) {
      const kv = sc.split(';')[0];
      if (kv.startsWith('bys_session=')) j.cookie = kv;
    }
  }
  let data = null;
  const text = await res.text();
  try { data = JSON.parse(text); } catch { data = text; }
  if (raw) return { res, data };
  return { status: res.status, data, location: res.headers.get('location') };
}

const futureDate = (daysAhead) => {
  const d = new Date(Date.now() + daysAhead * 86400000);
  return d.toISOString().slice(0, 10);
};

(async () => {
  const UNIQUE = Date.now().toString(36);
  const CUSTOMER_EMAIL = `test.customer.${UNIQUE}@example.com`;
  // clear any rate-limit counters left by earlier runs (admin-only maintenance call)
  const resetJar = jar();
  await req('/api/auth/login', { method: 'POST', jar: resetJar, body: { email: 'admin@bookyourspa.net', password: 'Admin@2026!' } });
  await req('/api/admin/rate-limits/reset', { method: 'POST', jar: resetJar });
  console.log('\n— Public API —');
  let r = await req('/api/config');
  ok('config loads', r.status === 200 && r.data.name === 'BookYourSpa', JSON.stringify(r.data).slice(0, 120));
  ok('demo payment mode', r.data.paymentMode === 'demo');

  r = await req('/api/spas?limit=50');
  ok('12+ approved spas listed', r.data.total >= 12, `got ${r.data.total}`);
  const spaList = r.data.items;

  r = await req('/api/spas/aurora-wellness-house');
  ok('spa detail has treatments', r.status === 200 && r.data.treatments.length >= 5, `n=${r.data.treatments?.length}`);
  ok('spa detail has reviews', r.data.reviews.length >= 1);

  r = await req('/api/spas/does-not-exist');
  ok('unknown spa -> 404', r.status === 404);

  r = await req('/api/destinations');
  ok('8 destinations with counts', r.data.items.length === 8 && r.data.items.every((i) => i.spa_count > 0));

  r = await req('/api/treatments');
  ok('treatment catalogue grouped', r.data.items.length >= 8, `n=${r.data.items.length}`);

  r = await req('/api/packages');
  ok('packages catalogue', r.data.items.length === 4, `n=${r.data.items.length}`);

  r = await req('/api/offers');
  ok('active offers >= 3', r.data.items.length >= 3, `n=${r.data.items.length}`);

  r = await req('/api/faqs');
  ok('faqs seeded', r.data.items.length === 10, `n=${r.data.items.length}`);

  r = await req('/api/reviews');
  ok('approved reviews', r.data.items.length >= 8, `n=${r.data.items.length}`);

  r = await req('/api/spas?destination=bali&category=massage&sort=rating');
  ok('search filters work', r.data.total === 2 && r.data.items.every((s) => s.destination === 'bali'), `total=${r.data.total}`);

  console.log('— Security —');
  r = await req('/api/auth/login', { method: 'POST', body: { email: 'x@y.com', password: 'Password1' }, csrf: false });
  ok('mutation without CSRF header -> 403', r.status === 403 && r.data.code === 'csrf');
  r = await req('/api/auth/login', { method: 'POST', body: { email: 'x@y.com', password: 'Password1' }, origin: 'https://evil.example' });
  ok('cross-origin mutation -> 403', r.status === 403 && r.data.code === 'csrf');
  r = await req('/api/admin/stats');
  ok('admin API unauthenticated -> 401', r.status === 401);

  console.log('— Customer auth + booking —');
  const cust = jar();
  r = await req('/api/auth/register', { method: 'POST', jar: cust, body: {
    role: 'customer', name: 'Test Customer', email: CUSTOMER_EMAIL, password: 'Holiday42', phone: '+1 555 0100' } });
  ok('customer registers (201, session cookie)', r.status === 201 && cust.cookie.includes('bys_session='), `status=${r.status}`);
  ok('registration returns user', r.data.user?.role === 'customer');

  r = await req('/api/auth/me', { jar: cust });
  ok('session persists via /me', r.data.user?.email === CUSTOMER_EMAIL);

  r = await req('/api/auth/register', { method: 'POST', jar: cust, body: {
    role: 'customer', name: 'Dup', email: CUSTOMER_EMAIL, password: 'Holiday42' } });
  ok('duplicate email -> 409', r.status === 409);

  r = await req('/api/auth/register', { method: 'POST', jar: cust, body: {
    role: 'customer', name: 'Weak', email: 'weak@example.com', password: 'short' } });
  ok('weak password rejected', r.status === 400);

  // availability + booking with promo
  const date = futureDate(6);
  r = await req(`/api/availability?spa=aurora-wellness-house&date=${date}&itemType=treatment&itemSlug=signature-massage`);
  ok('availability returns slots', r.status === 200 && r.data.slots.length > 0, JSON.stringify(r.data).slice(0, 100));
  const free = r.data.slots.find((s) => s.available);
  ok('has a free slot', !!free);
  const duration = r.data.durationMin;
  ok('duration returned', duration === 60, `d=${duration}`);

  r = await req('/api/bookings', { method: 'POST', jar: cust, body: {
    spaSlug: 'aurora-wellness-house', itemType: 'treatment', itemSlug: 'signature-massage',
    date, time: free.time, promoCode: 'WELCOME15', notes: 'Please book Ella if available' } });
  ok('booking created (201)', r.status === 201, JSON.stringify(r.data).slice(0, 200));
  const code = r.data.booking?.code;
  ok('booking code issued', /^[A-Z0-9]{8}$/.test(code ?? ''), `code=${code}`);
  ok('promo discount applied (135 -> 114.75)', r.data.booking?.total === 114.75, `total=${r.data.booking?.total}`);
  ok('payment mode in response', r.data.paymentMode === 'demo');

  // capacity: the spa has 3 treatment rooms — one booking already holds a slot
  const extras = [];
  for (let i = 0; i < 3; i++) {
    r = await req('/api/bookings', { method: 'POST', jar: cust, body: {
      spaSlug: 'aurora-wellness-house', itemType: 'treatment', itemSlug: 'signature-massage',
      date, time: free.time, guestName: `Capacity test ${i + 1}` } });
    if (r.status === 201) extras.push(r.data.booking.code);
  }
  ok('room capacity honoured (3 concurrent max)', extras.length === 2, `extra bookings=${extras.length}`);
  r = await req('/api/bookings', { method: 'POST', jar: cust, body: {
    spaSlug: 'aurora-wellness-house', itemType: 'treatment', itemSlug: 'signature-massage',
    date, time: free.time } });
  ok('4th concurrent slot -> 409', r.status === 409 && r.data.code === 'slot_unavailable', `status=${r.status}`);
  for (const ec of extras) {
    await req(`/api/bookings/${ec}/cancel`, { method: 'POST', jar: cust, body: { reason: 'test cleanup' } });
  }

  r = await req('/api/bookings', { method: 'POST', jar: cust, body: {
    spaSlug: 'aurora-wellness-house', itemType: 'treatment', itemSlug: 'signature-massage',
    date, time: '07:00' } });
  ok('invalid time -> 400/409', r.status === 400 || r.status === 409, `status=${r.status}`);

  r = await req(`/api/bookings/${code}/pay`, { method: 'POST', jar: cust, body: { cardNumber: '1234 5678 9012 3456' } });
  ok('invalid card declined (402)', r.status === 402, `status=${r.status}`);
  r = await req(`/api/bookings/${code}/pay`, { method: 'POST', jar: cust, body: { cardNumber: '4242 4242 4242 4242' } });
  ok('valid demo card paid', r.status === 200 && r.data.paid === true, JSON.stringify(r.data));

  r = await req('/api/bookings/mine', { jar: cust });
  const mine = r.data.items.find((b) => b.code === code);
  ok('booking listed as paid/pending', mine?.paymentStatus === 'paid' && mine?.status === 'pending', JSON.stringify(mine).slice(0, 200));
  ok('cancel deadline set (~6 days out)', !!mine?.cancelDeadline);

  r = await req('/api/bookings/summary', { jar: cust });
  ok('customer summary counts', r.data.upcoming === 1 && r.data.spent > 0, JSON.stringify(r.data));

  r = await req('/api/me/notifications', { jar: cust });
  ok('customer has notifications', r.data.unread >= 1, `unread=${r.data.unread}`);

  console.log('— Supplier flow —');
  const sup = jar();
  r = await req('/api/auth/login', { method: 'POST', jar: sup, body: { email: 'owner@aurora-wellness.com', password: 'Supplier@2026!' } });
  ok('supplier logs in', r.status === 200 && r.data.user?.role === 'supplier', `status=${r.status}`);
  ok('supplier status approved', r.data.user?.supplier_status === 'approved');

  r = await req('/api/supplier/overview', { jar: sup });
  ok('overview stats', r.status === 200 && r.data.spas.length === 1, JSON.stringify(r.data.stats));

  r = await req('/api/supplier/bookings', { jar: sup });
  const sb = r.data.items.find((b) => b.code === code);
  ok('supplier sees the paid booking', !!sb && sb.customer_email === CUSTOMER_EMAIL);

  r = await req(`/api/supplier/bookings/${code}`, { method: 'PATCH', jar: sup, body: { status: 'confirmed' } });
  ok('supplier confirms booking', r.status === 200);

  r = await req('/api/bookings/mine', { jar: cust });
  ok('customer sees confirmed status', r.data.items.find((b) => b.code === code)?.status === 'confirmed');

  r = await req('/api/supplier/earnings', { jar: sup });
  ok('earnings show commission split', r.status === 200 && r.data.commissionPercent === 15, JSON.stringify(r.data.months).slice(0, 150));

  r = await req('/api/supplier/spas', { jar: sup });
  ok('supplier lists own spa', r.data.items.length === 1 && r.data.items[0].slug === 'aurora-wellness-house');

  console.log('— Cancellation —');
  r = await req(`/api/bookings/${code}/cancel`, { method: 'POST', jar: cust, body: { reason: 'Change of plans' } });
  ok('customer cancels (refund)', r.status === 200 && r.data.refunded === true, JSON.stringify(r.data));
  r = await req('/api/bookings/mine', { jar: cust });
  ok('cancelled booking moved to past', r.data.items.every((b) => b.code !== code));
})().catch((e) => { console.error(e); process.exit(1); });

process.on('exit', () => {
  console.log(`\nRESULT: ${pass} passed, ${fail} failed${fail ? ' — ' + failures.join(' | ') : ''}`);
  process.exit(fail ? 1 : 0);
});
