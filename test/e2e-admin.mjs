/* Admin flows, RBAC page gating, moderation, rate limiting. */
const BASE = process.env.BASE ?? 'http://127.0.0.1:8787';
let pass = 0, fail = 0; const failures = [];
const ok = (n, c, x = '') => { c ? (pass++, console.log(`  ✓ ${n}`)) : (fail++, failures.push(n), console.log(`  ✗ ${n} ${x}`)); };
const jar = () => ({ cookie: '' });
async function req(path, { method = 'GET', body, jar: j, csrf = true, origin, headers: extra } = {}) {
  const headers = { 'content-type': 'application/json', ...(extra ?? {}) };
  if (csrf) headers['x-bys-csrf'] = '1';
  if (j?.cookie) headers.cookie = j.cookie;
  if (origin) headers.origin = origin;
  const res = await fetch(BASE + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const sc = res.headers.getSetCookie?.() ?? [];
  if (j) for (const c of sc) if (c.startsWith('bys_session=')) j.cookie = c.split(';')[0];
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, location: res.headers.get('location') };
}

(async () => {
  const uniquePromo = `T${Date.now().toString(36).toUpperCase().slice(-6)}`;
  console.log('— RBAC page gating (HTML) —');
  let r = await req('/admin', { csrf: false });
  ok('anonymous /admin -> 302 /login', r.status === 302 && r.location?.startsWith('/login'), `status=${r.status} loc=${r.location}`);
  r = await req('/supplier', { csrf: false });
  ok('anonymous /supplier -> 302 /login', r.status === 302 && r.location?.startsWith('/login'));

  const cust = jar();
  r = await req('/api/auth/login', { method: 'POST', jar: cust, body: { email: 'anna.customer@example.com', password: 'Customer@2026!' } });
  ok('demo customer logs in', r.status === 200, `status=${r.status}`);
  r = await req('/admin', { csrf: false, jar: cust });
  ok('customer /admin -> redirected to own area', r.status === 302 && r.location === '/login', `loc=${r.location}`);
  r = await req('/supplier', { csrf: false, jar: cust });
  ok('customer /supplier -> redirected to /login', r.status === 302 && r.location === '/login', `loc=${r.location}`);
  r = await req('/api/admin/stats', { jar: cust });
  ok('customer hitting admin API -> 403', r.status === 403, `status=${r.status}`);

  console.log('— Pending supplier lifecycle —');
  const ced = jar();
  const supplierEmail = `pending.supplier.${Date.now().toString(36)}@example.com`;
  r = await req('/api/auth/register', { method: 'POST', jar: ced, body: {
    role: 'supplier', name: 'Jonah Fields', email: supplierEmail, password: 'Supplier42',
    companyName: 'Fresh Springs Bathhouse', country: 'United Kingdom' } });
  ok('supplier registers -> pending status', r.status === 201 && r.data.supplierStatus === 'pending', JSON.stringify(r.data).slice(0, 160));
  r = await req('/api/supplier/status', { jar: ced });
  ok('status endpoint reports pending', r.data.status === 'pending', JSON.stringify(r.data));
  r = await req('/api/supplier/overview', { jar: ced });
  ok('pending supplier blocked from dashboard data -> 403', r.status === 403 && r.data.code === 'pending_approval', `status=${r.status}`);

  const admin = jar();
  r = await req('/api/auth/login', { method: 'POST', jar: admin, body: { email: 'admin@bookyourspa.net', password: 'Admin@2026!' } });
  ok('admin logs in', r.status === 200 && r.data.user?.role === 'admin');
  r = await req('/admin', { csrf: false, jar: admin });
  ok('admin /admin serves app shell (200)', r.status === 200, `status=${r.status}`);

  r = await req('/api/admin/rate-limits/reset', { method: 'POST', jar: admin });
  ok('admin can reset rate counters', r.status === 200);
  r = await req('/api/admin/stats', { jar: admin });
  ok('admin stats load', r.status === 200 && r.data.counts.spas >= 12, JSON.stringify(r.data.counts).slice(0, 160));
  ok('commission revenue tracked', typeof r.data.revenue.commission === 'number');
  ok('monthly series present', Array.isArray(r.data.monthly));

  r = await req('/api/admin/suppliers?status=pending', { jar: admin });
  const cedar = r.data.items.find((s) => s.email === supplierEmail);
  ok('pending supplier in queue', !!cedar, JSON.stringify(r.data.items.map((i) => i.email)).slice(0, 200));

  r = await req(`/api/admin/suppliers/${cedar.id}`, { method: 'PATCH', jar: admin, body: { status: 'approved', notes: 'Reviewed and approved' } });
  ok('admin approves supplier', r.status === 200);
  r = await req('/api/supplier/status', { jar: ced });
  ok('supplier now approved', r.data.status === 'approved');
  r = await req('/api/supplier/overview', { jar: ced });
  ok('approved supplier reaches dashboard', r.status === 200, `status=${r.status}`);

  console.log('— Spa listing approval —');
  const listingName = `Fresh Springs Bathhouse ${Date.now().toString(36).slice(-4)}`;
  r = await req('/api/supplier/spas', { method: 'POST', jar: ced, body: {
    name: listingName, destination: 'london', city: 'Bath', country: 'United Kingdom',
    address: '12 Hot Wall Parade, Bath BA1 5NJ', summary: 'A calm geothermal bathhouse opening this season.',
    categories: ['thermal'], facilities: ['Geothermal pools', 'Sauna'] } });
  ok('supplier creates listing -> pending', r.status === 201 && r.data.status === 'pending', JSON.stringify(r.data));
  const newSpaId = r.data.id;
  const newSpaSlug = r.data.slug;

  r = await req(`/api/spas/${newSpaSlug}`);
  ok('pending spa hidden from public detail', r.status === 404, `status=${r.status}`);
  r = await req('/api/admin/spas?status=pending', { jar: admin });
  const cedarSpa = r.data.items.find((s) => s.id === newSpaId);
  ok('pending listing in admin queue', !!cedarSpa, JSON.stringify(r.data.items.map((i) => i.slug)).slice(0, 200));
  r = await req(`/api/admin/spas/${newSpaId}`, { method: 'PATCH', jar: admin, body: { status: 'approved', featured: true } });
  ok('admin approves listing', r.status === 200);
  r = await req(`/api/spas/${newSpaSlug}`);
  ok('approved listing live publicly', r.status === 200, `status=${r.status}`);

  // Regression: the supplier Overview tab renders `s.counts.treatments/packages` per listing —
  // the payload must carry them or the dashboard throws and the page goes blank.
  r = await req('/api/supplier/overview', { jar: ced });
  const countsShape = (s) => s.counts && [s.counts.treatments, s.counts.packages, s.counts.upcoming].every((n) => typeof n === 'number');
  ok('supplier overview carries per-listing counts after approval',
    r.status === 200 && r.data.spas.length > 0 && r.data.spas.every(countsShape),
    JSON.stringify(r.data.spas?.map((s) => ({ name: s.name, counts: s.counts }))));

  console.log('— Settings / SEO management —');
  r = await req('/api/admin/settings', { jar: admin });
  ok('settings load', r.status === 200 && !!r.data.settings.site_title);
  r = await req('/api/admin/settings', { method: 'PATCH', jar: admin, body: { commission_percent: 20, site_description: 'Test meta description' } });
  ok('admin updates commission', r.status === 200);
  r = await req('/api/config');
  ok('public config reflects new commission', r.data.commissionPercent === 20, `got ${r.data.commissionPercent}`);
  r = await req('/api/admin/settings', { method: 'PATCH', jar: admin, body: { commission_percent: 15 } });
  ok('commission restored', r.status === 200);
  r = await req('/api/admin/settings', { method: 'PATCH', jar: admin, body: { commission_percent: 99 } });
  ok('invalid commission rejected', r.status === 400);
  r = await req('/api/admin/settings', { method: 'PATCH', jar: admin, body: { not_a_setting: 'x' } });
  ok('unknown keys ignored/rejected', r.status === 400);

  console.log('— Promotions, contact, moderation, users —');
  r = await req('/api/admin/offers', { method: 'POST', jar: admin, body: {
    code: uniquePromo, title: 'Test offer', description: 'x', discountType: 'percent', value: 20,
    minSpend: 50, startsAt: '2026-01-01', endsAt: '2026-12-31' } });
  ok('admin creates promo', r.status === 201, JSON.stringify(r.data));
  r = await req('/api/offers');
  ok('promo live publicly', r.data.items.some((o) => o.code === uniquePromo));

  r = await req('/api/contact', { method: 'POST', body: { name: 'Web Visitor', email: 'visitor@example.com', body: 'Do you do group bookings for 12?' } });
  ok('contact form accepted', r.status === 200);
  r = await req('/api/admin/messages', { jar: admin });
  ok('message reaches admin inbox', r.data.items.some((m) => m.email === 'visitor@example.com'));

  r = await req('/api/admin/reviews?status=approved', { jar: admin });
  const someReview = r.data.items[0];
  r = await req(`/api/admin/reviews/${someReview.id}`, { method: 'PATCH', jar: admin, body: { status: 'hidden' } });
  ok('admin hides review', r.status === 200);
  const restoreId = someReview.id;
  r = await req(`/api/spas/${someReview.spa_name ? '' : ''}` ? '/api/reviews?limit=50' : '/api/reviews', { });
  ok('hidden review gone from public list', !r.data.items.some((x) => x.id === someReview.id));
  r = await req(`/api/admin/reviews/${restoreId}`, { method: 'PATCH', jar: admin, body: { status: 'approved' } });
  ok('admin restores review', r.status === 200);

  r = await req('/api/admin/users?q=anna', { jar: admin });
  const anna = r.data.items.find((u) => u.email === 'anna.customer@example.com');
  ok('admin finds user', !!anna);
  r = await req(`/api/admin/users/${anna.id}`, { method: 'PATCH', jar: admin, body: { status: 'suspended' } });
  ok('admin suspends user', r.status === 200);
  const anna2 = jar();
  r = await req('/api/auth/login', { method: 'POST', jar: anna2, body: { email: 'anna.customer@example.com', password: 'Customer@2026!' } });
  ok('suspended user cannot log in', r.status === 403, `status=${r.status}`);
  r = await req(`/api/admin/users/${anna.id}`, { method: 'PATCH', jar: admin, body: { status: 'active' } });
  ok('admin reactivates user', r.status === 200);

  console.log('— Email outbox + brute force protection —');
  r = await req('/api/admin/emails', { jar: admin });
  ok('outbox logged for admin', r.data.items.length > 0, `n=${r.data.items.length}`);
  const brutef = jar();
  let limited = false;
  for (let i = 0; i < 10; i++) {
    const x = await req('/api/auth/login', { method: 'POST', jar: brutef, body: { email: 'brute.force@example.com', password: 'WrongPass1' } });
    if (x.status === 429) { limited = true; break; }
  }
  ok('login rate limit kicks in', limited);

  console.log('— Promo actually discounts a new booking —');
  const bjar = jar();
  r = await req('/api/auth/register', { method: 'POST', jar: bjar, body: { role: 'customer', name: 'Promo Tester', email: `promo.${Date.now().toString(36)}@example.com`, password: 'Holiday42' } });
  ok('promo tester registered', r.status === 201);
  const date = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
  r = await req(`/api/availability?spa=ubud-botanica-spa&date=${date}&itemType=treatment&itemSlug=signature-massage`);
  const slot = r.data.slots.find((s) => s.available);
  ok('ubud has availability', !!slot);
  r = await req('/api/bookings', { method: 'POST', jar: bjar, body: {
    spaSlug: 'ubud-botanica-spa', itemType: 'treatment', itemSlug: 'signature-massage', date, time: slot.time, promoCode: 'SUNRISE10' } });
  ok('SUNRISE10 gives 10% off ($65 -> $58.5)', r.data.booking?.total === 58.5, `total=${r.data.booking?.total}`);
  r = await req('/api/bookings', { method: 'POST', jar: bjar, body: {
    spaSlug: 'ubud-botanica-spa', itemType: 'treatment', itemSlug: 'signature-massage', date, time: slot.time, promoCode: 'NOPE99' } });
  ok('invalid promo rejected', r.status === 400);
})().catch((e) => { console.error(e); process.exit(1); });

process.on('exit', () => {
  console.log(`\nRESULT: ${pass} passed, ${fail} failed${fail ? ' — ' + failures.join(' | ') : ''}`);
  process.exit(fail ? 1 : 0);
});
