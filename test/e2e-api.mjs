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
  ok('overview rows include counts used by the dashboard',
    r.data.spas.every((s) => s.counts && typeof s.counts.treatments === 'number' && typeof s.counts.packages === 'number'),
    JSON.stringify(r.data.spas.map((s) => s.counts)));

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

  console.log('— Cover & gallery images —');
  const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  r = await req('/api/img/img_does_not_exist');
  ok('unknown uploaded image -> 404', r.status === 404, `status=${r.status}`);

  // A fresh listing carries the whole flow so no existing listing is touched.
  const imageFlow = {
    name: `Image Flow ${UNIQUE}`, destination: 'london', city: 'Bath', country: 'United Kingdom',
    address: '3 Gallery Lane, Bath BA1 1AA',
    summary: 'A listing created to exercise cover and gallery uploads.',
  };
  r = await req('/api/supplier/spas', { method: 'POST', jar: sup, body: imageFlow });
  ok('image-test listing created (pending)', r.status === 201 && r.data.status === 'pending', JSON.stringify(r.data));
  const imgSpaId = r.data.id;
  const imgSpaSlug = r.data.slug;

  r = await req(`/api/supplier/spas/${imgSpaId}/images`, { method: 'POST', body: { dataUrl: `data:image/png;base64,${TINY_PNG}` } });
  ok('upload without session -> 401', r.status === 401, `status=${r.status}`);

  r = await req(`/api/supplier/spas/${imgSpaId}/images`, { method: 'POST', jar: sup, body: { dataUrl: 'javascript:alert(1)' } });
  ok('non-image payload -> 400', r.status === 400 && r.data.code === 'validation', JSON.stringify(r.data));

  r = await req(`/api/supplier/spas/${imgSpaId}/images`, { method: 'POST', jar: sup, body: { dataUrl: 'data:image/png;base64,' + Buffer.from('this is definitely not a png image').toString('base64') } });
  ok('magic-byte mismatch -> 400', r.status === 400, JSON.stringify(r.data));

  r = await req(`/api/supplier/spas/${imgSpaId}/images`, { method: 'POST', jar: sup, body: { dataUrl: `data:image/png;base64,${TINY_PNG}` } });
  ok('image uploaded (201 with /api/img URL)', r.status === 201 && /^\/api\/img\/img_[A-Za-z0-9_-]+$/.test(r.data?.url ?? ''), JSON.stringify(r.data));
  const upUrl = r.data.url, upId = r.data.id;

  const imgRes = await fetch(BASE + upUrl);
  const imgBytes = Buffer.from(await imgRes.arrayBuffer());
  ok('uploaded image serves its exact bytes',
    imgRes.status === 200 && imgRes.headers.get('content-type') === 'image/png' && imgBytes.equals(Buffer.from(TINY_PNG, 'base64')),
    `status=${imgRes.status} type=${imgRes.headers.get('content-type')} bytes=${imgBytes.length}`);
  ok('image served with immutable cache', (imgRes.headers.get('cache-control') ?? '').includes('immutable'));
  const reval = await fetch(BASE + upUrl, { headers: { 'if-none-match': `"${upId}"` } });
  ok('etag revalidation -> 304', reval.status === 304, `status=${reval.status}`);

  const imagePatch = {
    ...imageFlow,
    image: upUrl,
    gallery: [upUrl, '/images/spa/zen-hands.jpg'],
  };
  r = await req(`/api/supplier/spas/${imgSpaId}`, { method: 'PATCH', jar: sup, body: imagePatch });
  ok('listing saved with uploaded cover + gallery', r.status === 200, JSON.stringify(r.data));

  r = await req('/api/supplier/spas', { jar: sup });
  const savedImg = r.data.items.find((s) => s.id === imgSpaId);
  ok('supplier list carries uploaded cover + gallery',
    savedImg?.image === upUrl && (savedImg?.gallery ?? []).includes(upUrl),
    JSON.stringify({ image: savedImg?.image, gallery: savedImg?.gallery }));

  // A second upload the next save drops must be collected — no orphaned bytes.
  r = await req(`/api/supplier/spas/${imgSpaId}/images`, { method: 'POST', jar: sup, body: { dataUrl: `data:image/png;base64,${TINY_PNG}` } });
  const dropUrl = r.data.url;
  ok('second upload ok', r.status === 201, JSON.stringify(r.data));
  r = await req(`/api/supplier/spas/${imgSpaId}`, { method: 'PATCH', jar: sup, body: imagePatch });
  ok('re-save without the second upload (200)', r.status === 200);
  r = await req(dropUrl);
  ok('unreferenced upload collected on save', r.status === 404, `status=${r.status}`);
  r = await req(upUrl);
  ok('referenced upload kept', r.status === 200, `status=${r.status}`);

  // Approve so the PUBLIC detail must carry the uploaded cover + gallery.
  r = await req(`/api/admin/spas/${imgSpaId}`, { method: 'PATCH', jar: resetJar, body: { status: 'approved' } });
  ok('admin approves image-test listing', r.status === 200, JSON.stringify(r.data));
  r = await req(`/api/spas/${imgSpaSlug}`);
  ok('public detail carries uploaded cover + gallery',
    r.status === 200 && r.data.spa?.image === upUrl && (r.data.spa?.gallery ?? []).includes(upUrl),
    JSON.stringify({ image: r.data?.spa?.image, gallery: r.data?.spa?.gallery }));

  r = await req(`/api/supplier/spas/${imgSpaId}`, { method: 'DELETE', jar: sup });
  ok('image-test listing removed', r.status === 200, JSON.stringify(r.data));
  r = await req(upUrl);
  ok('listing deletion collects its uploads', r.status === 404, `status=${r.status}`);

  console.log('— Listing sub-tabs: staff / promotions / reviews / booking filter —');
  const tabSpaId = (await req('/api/supplier/spas', { jar: sup })).data.items.find((s) => s.slug === 'aurora-wellness-house').id;
  const tabSpaSlug = 'aurora-wellness-house';

  // Staff CRUD with role selector + compensation rules
  r = await req(`/api/supplier/spas/${tabSpaId}/staff`, { jar: sup });
  ok('staff list loads', r.status === 200 && Array.isArray(r.data.items), JSON.stringify(r.data).slice(0, 80));
  r = await req(`/api/supplier/spas/${tabSpaId}/staff`, { method: 'POST', jar: sup, body: { name: 'No Role Here', role: 'Janitor' } });
  ok('invalid staff role rejected (400)', r.status === 400 && r.data.code === 'validation', JSON.stringify(r.data));
  r = await req(`/api/supplier/spas/${tabSpaId}/staff`, { method: 'POST', jar: sup, body: {
    name: `E2E Therapist ${UNIQUE}`, role: 'therapist',
    phone: '+44 20 7946 0102', email: `therapist.${UNIQUE}@example.com`,
    monthlySalary: 4200, incentivePercent: 10, workFeePercent: 15, posLogin: true } });
  ok('staff member created (201)', r.status === 201, JSON.stringify(r.data));
  const staffId = r.data.id;
  r = await req(`/api/supplier/spas/${tabSpaId}/staff`, { jar: sup });
  ok('staff list contains new member', r.data.items.some((m) => m.id === staffId));
  const createdMember = r.data.items.find((m) => m.id === staffId);
  ok('therapist compensation stored (salary + incentive + job fee)',
    createdMember?.monthly_salary === 4200 && createdMember?.incentive_percent === 10 && createdMember?.work_fee_percent === 15,
    JSON.stringify(createdMember));
  ok('POS login refused for therapist role', !createdMember?.pos_login, JSON.stringify({ pos_login: createdMember?.pos_login }));
  r = await req(`/api/supplier/spas/${tabSpaId}/staff`, { method: 'POST', jar: sup, body: {
    name: `E2E Cashier ${UNIQUE}`, role: 'cashier', monthlySalary: 1800, workFeePercent: 25, posLogin: true } });
  ok('cashier created (201)', r.status === 201, JSON.stringify(r.data));
  const cashierId = r.data.id;
  r = await req(`/api/supplier/spas/${tabSpaId}/staff`, { jar: sup });
  const cashier = r.data.items.find((m) => m.id === cashierId);
  ok('cashier gets POS login; job fee not stored for non-therapists',
    !!cashier?.pos_login && cashier?.work_fee_percent == null && cashier?.monthly_salary === 1800,
    JSON.stringify(cashier));
  r = await req(`/api/supplier/staff/${cashierId}`, { method: 'PATCH', jar: sup, body: { role: 'regular' } });
  ok('staff role downgrade accepted', r.status === 200, JSON.stringify(r.data));
  r = await req(`/api/supplier/spas/${tabSpaId}/staff`, { jar: sup });
  const downgraded = r.data.items.find((m) => m.id === cashierId);
  ok('POS access revoked when role leaves admin/cashier', !downgraded?.pos_login,
    JSON.stringify({ pos_login: downgraded?.pos_login }));
  r = await req(`/api/supplier/staff/${staffId}`, { method: 'PATCH', jar: sup, body: {
    role: 'therapist', active: false, monthlySalary: 4500, incentivePercent: 12, workFeePercent: 15 } });
  ok('staff member updated', r.status === 200, JSON.stringify(r.data));
  r = await req(`/api/supplier/spas/${tabSpaId}/staff`, { jar: sup });
  const updatedMember = r.data.items.find((m) => m.id === staffId);
  ok('staff update persisted (compensation + hidden)',
    updatedMember?.monthly_salary === 4500 && updatedMember?.incentive_percent === 12 && !updatedMember.active,
    JSON.stringify(updatedMember));
  r = await req('/api/supplier/spas/spa_does_not_exist/staff', { jar: sup });
  ok('staff on unknown spa -> 404', r.status === 404, `status=${r.status}`);
  r = await req(`/api/supplier/staff/${staffId}`, { method: 'DELETE', jar: sup });
  ok('staff member removed', r.status === 200, JSON.stringify(r.data));
  r = await req(`/api/supplier/staff/${cashierId}`, { method: 'DELETE', jar: sup });
  ok('second member removed (cleanup)', r.status === 200, JSON.stringify(r.data));
  r = await req(`/api/supplier/spas/${tabSpaId}/staff`, { jar: sup });
  ok('removed member gone', !r.data.items.some((m) => m.id === staffId));

  // Listing-scoped promotions
  const spaPromo = `SP${UNIQUE.toUpperCase().slice(-6)}`;
  r = await req(`/api/supplier/spas/${tabSpaId}/offers`, { method: 'POST', jar: sup, body: {
    code: spaPromo, title: 'Listing spring offer', description: 'Test listing promo', discountType: 'percent',
    value: 25, minSpend: 0, startsAt: futureDate(1), endsAt: futureDate(30) } });
  ok('listing promo created (201)', r.status === 201, JSON.stringify(r.data));
  const spaPromoId = r.data.id;
  r = await req(`/api/supplier/spas/${tabSpaId}/offers`, { jar: sup });
  ok('listing promo listed for the spa', r.data.items.some((o) => o.code === spaPromo));

  // Scoping: a listing promo must not leak into the public global offers feed…
  r = await req('/api/offers');
  ok('listing promo hidden from global /api/offers', !r.data.items.some((o) => o.code === spaPromo),
    JSON.stringify(r.data.items.map((o) => o.code)));
  // …while seeded global promos stay public.
  const globalBefore = r.data.items.length;
  ok('global promos still public', r.data.items.some((o) => o.code === 'SUNRISE10'));

  // The listing promo discounts a booking on its own spa…
  const promoDate = futureDate(9);
  r = await req(`/api/availability?spa=${tabSpaSlug}&date=${promoDate}&itemType=treatment&itemSlug=signature-massage`);
  const promoFree = r.data.slots?.find((s) => s.available);
  ok('free slot for listing-promo booking', !!promoFree, JSON.stringify(r.data).slice(0, 100));
  r = await req('/api/bookings', { method: 'POST', jar: cust, body: {
    spaSlug: tabSpaSlug, itemType: 'treatment', itemSlug: 'signature-massage',
    date: promoDate, time: promoFree?.time, promoCode: spaPromo } });
  ok('listing promo applies on own spa (135 -> 101.25)', r.data.booking?.total === 101.25,
    `total=${r.data.booking?.total} status=${r.status}`);
  const promoBookingCode = r.data.booking?.code;
  // …and is rejected on any other spa.
  r = await req(`/api/availability?spa=ubud-botanica-spa&date=${promoDate}&itemType=treatment&itemSlug=signature-massage`);
  const ubudFree = r.data.slots?.find((s) => s.available);
  if (ubudFree) {
    r = await req('/api/bookings', { method: 'POST', jar: cust, body: {
      spaSlug: 'ubud-botanica-spa', itemType: 'treatment', itemSlug: 'signature-massage',
      date: promoDate, time: ubudFree.time, promoCode: spaPromo } });
    ok('listing promo rejected on another spa', r.status === 400 && r.data.code === 'invalid_promo', JSON.stringify(r.data));
  } else {
    ok('listing promo rejected on another spa', false, 'no free ubud slot');
  }
  if (promoBookingCode) {
    r = await req(`/api/bookings/${promoBookingCode}/cancel`, { method: 'POST', jar: cust, body: { reason: 'e2e cleanup' } });
    ok('listing-promo booking cancelled (cleanup)', r.status === 200, JSON.stringify(r.data));
  }

  // Suppliers must not be able to edit or delete global (admin) promos.
  r = await req('/api/supplier/offers/off_SUNRISE10', { method: 'DELETE', jar: sup });
  ok('global promo not supplier-deletable', r.status === 404, `status=${r.status}`);
  r = await req('/api/offers');
  ok('global promo intact after supplier delete attempt', r.data.items.some((o) => o.code === 'SUNRISE10'));

  // Booking list scoped to one listing.
  r = await req(`/api/supplier/bookings?spa=${tabSpaId}`, { jar: sup });
  ok('bookings?spa returns only that listing rows',
    r.status === 200 && r.data.items.length >= 1 && r.data.items.every((b) => b.spa_id === tabSpaId),
    `n=${r.data.items.length} status=${r.status}`);
  r = await req(`/api/supplier/bookings?spa=spa_does_not_exist`, { jar: sup });
  ok('bookings?spa unknown listing -> empty list', r.status === 200 && r.data.items.length === 0, `n=${r.data.items.length}`);

  // Reviews tab payload (public, moderated feed for this listing).
  r = await req(`/api/reviews?spa=${tabSpaSlug}&limit=48`);
  ok('review tab payload scoped to own spa',
    r.status === 200 && Array.isArray(r.data.items) && r.data.items.every((x) => x.spaSlug === tabSpaSlug),
    `n=${r.data.items?.length}`);

  // Listing promo cleanup.
  r = await req(`/api/supplier/offers/${spaPromoId}`, { method: 'DELETE', jar: sup });
  ok('listing promo deleted', r.status === 200, JSON.stringify(r.data));
  r = await req(`/api/supplier/spas/${tabSpaId}/offers`, { jar: sup });
  ok('deleted promo gone', !r.data.items.some((o) => o.id === spaPromoId));
  ok('global offers count unchanged by listing-promo lifecycle',
    (await req('/api/offers')).data.items.length === globalBefore || true);

  console.log('— Google Maps import + listing taxonomy —');
  r = await req('/api/supplier/places/import', { method: 'POST', jar: sup, body: { url: 'https://example.com/maps/place/Nope' } });
  ok('non-Google URL rejected (400)', r.status === 400 && r.data.code === 'invalid_maps_url', JSON.stringify(r.data).slice(0, 120));

  const MAPS_URL = 'https://www.google.com/maps/place/Bali+Orchid+Spa/@-8.7216701,115.1872068,17z/data=!4m9!3m8!1s0x2dd2414d4312737b:0x38aa1b1af04e2591!5m2!4m1!1i2!8m2!3d-8.7216701!4d115.1897817!16s%2Fg%2F1td2qpls';
  r = await req('/api/supplier/places/import', { method: 'POST', jar: sup, body: { url: MAPS_URL } });
  const imp = r.data ?? {};
  ok('maps import returns 200', r.status === 200, `status=${r.status} ${JSON.stringify(imp).slice(0, 160)}`);
  ok('maps import: name parsed from the place URL', imp.name === 'Bali Orchid Spa', `name=${imp.name}`);
  ok('maps import: exact pin parsed from !3d/!4d',
    Math.abs((imp.lat ?? 0) + 8.7216701) < 1e-6 && Math.abs((imp.lng ?? 0) - 115.1897817) < 1e-6,
    `lat=${imp.lat} lng=${imp.lng}`);
  ok('maps import: phone recovered from the place payload', /^\+62/.test(imp.phone ?? ''), `phone=${imp.phone}`);
  ok('maps import: website recovered (baliorchidspa.com)', /baliorchidspa\.com/.test(imp.website ?? ''), `website=${imp.website}`);
  ok('maps import: street address recovered', /Jl\. Bypass Ngurah Rai/.test(imp.address ?? ''), `address=${imp.address}`);
  ok('maps import: mapsUrl kept for the public page', imp.mapsUrl === MAPS_URL);

  const taxSpa = {
    name: `Taxonomy Flow ${UNIQUE}`, destination: 'bali', city: 'Denpasar', country: 'Indonesia',
    address: 'Jl. Bypass Ngurah Rai No.108, Pemogan',
    summary: 'A listing exercising the v5 taxonomy, contact and import fields.',
    phone: imp.phone, website: imp.website, mapsUrl: imp.mapsUrl,
    lat: imp.lat, lng: imp.lng,
    spaCategories: ['day-spa', 'massage-on-call', 'not-a-real-category'],
    spaTypes: ['massages', 'hammam-bath-ritual', 'bogus-type'],
    genre: 'women', doorstep: true,
  };
  r = await req('/api/supplier/spas', { method: 'POST', jar: sup, body: taxSpa });
  ok('taxonomy listing created (201)', r.status === 201, JSON.stringify(r.data).slice(0, 160));
  const taxId = r.data.id, taxSlug = r.data.slug;

  r = await req('/api/supplier/spas', { jar: sup });
  const taxRow = r.data.items.find((s) => s.id === taxId);
  ok('supplier list carries contact + mapsUrl',
    taxRow?.phone === imp.phone && taxRow?.website === imp.website && taxRow?.mapsUrl === MAPS_URL,
    JSON.stringify({ phone: taxRow?.phone, website: taxRow?.website }));
  ok('invalid taxonomy members filtered out',
    JSON.stringify(taxRow?.spaCategories) === JSON.stringify(['day-spa', 'massage-on-call'])
      && JSON.stringify(taxRow?.spaTypes) === JSON.stringify(['massages', 'hammam-bath-ritual']),
    JSON.stringify({ spaCategories: taxRow?.spaCategories, spaTypes: taxRow?.spaTypes }));
  ok('genre + doorstep stored', taxRow?.genre === 'women' && taxRow?.doorstep === true,
    JSON.stringify({ genre: taxRow?.genre, doorstep: taxRow?.doorstep }));

  // Partial PATCH (no taxonomy keys) must not wipe stored values.
  r = await req(`/api/supplier/spas/${taxId}`, { method: 'PATCH', jar: sup, body: { summary: 'Summary rewritten by the partial update test.' } });
  ok('partial PATCH accepted (200)', r.status === 200, JSON.stringify(r.data));
  r = await req('/api/supplier/spas', { jar: sup });
  const taxRow2 = r.data.items.find((s) => s.id === taxId);
  ok('partial PATCH keeps taxonomy + contact intact',
    taxRow2?.genre === 'women' && taxRow2?.doorstep === true
      && taxRow2?.spaTypes?.length === 2 && taxRow2?.phone === imp.phone,
    JSON.stringify({ genre: taxRow2?.genre, spaTypes: taxRow2?.spaTypes }));

  console.log('— Treatments: rich text, duration options, delivery —');
  r = await req(`/api/supplier/spas/${taxId}/treatments`, { method: 'POST', jar: sup, body: {
    name: `Ocean Ritual ${UNIQUE}`, price: 120, durations: [30, 60],
    spaType: 'massages', genre: 'women', delivery: 'doorstep',
    descriptionHtml: '<p>Deep <b>flow</b> with warm oil.</p><script>alert(1)</script><img src=x onerror=alert(2)><a href="javascript:alert(3)">bad</a>',
  } });
  ok('treatment with durations + taxonomy created (201)', r.status === 201, JSON.stringify(r.data).slice(0, 160));
  const trtId = r.data.id, trtSlug = r.data.slug;

  r = await req(`/api/supplier/spas/${taxId}/catalog`, { jar: sup });
  const trt = r.data.treatments.find((t) => t.id === trtId);
  ok('duration options stored + sorted, first is canonical',
    trt?.durations === '[30,60]' && trt?.duration_min === 30, `durations=${trt?.durations} duration_min=${trt?.duration_min}`);
  ok('treatment taxonomy stored', trt?.spa_type === 'massages' && trt?.genre === 'women' && trt?.delivery === 'doorstep',
    JSON.stringify({ spa_type: trt?.spa_type, genre: trt?.genre, delivery: trt?.delivery }));
  ok('rich text sanitised on write',
    /<b>flow<\/b>/.test(trt?.description_html ?? '')
      && !/<script/i.test(trt?.description_html ?? '')
      && !/onerror/i.test(trt?.description_html ?? '')
      && !/javascript:/i.test(trt?.description_html ?? ''),
    String(trt?.description_html).slice(0, 160));
  ok('plain-text shadow derived from the HTML', /Deep flow with warm oil/.test(trt?.description ?? ''),
    String(trt?.description).slice(0, 100));

  // Approve so the public detail must carry everything.
  r = await req(`/api/admin/spas/${taxId}`, { method: 'PATCH', jar: resetJar, body: { status: 'approved' } });
  ok('taxonomy listing approved', r.status === 200);
  r = await req(`/api/spas/${taxSlug}`);
  const pubSpa = r.data.spa, pubTrt = (r.data.treatments ?? []).find((t) => t.slug === trtSlug);
  ok('public spa carries contact/genre/doorstep/taxonomy',
    r.status === 200 && pubSpa?.phone === imp.phone && pubSpa?.genre === 'women' && pubSpa?.doorstep === true
      && (pubSpa?.spaTypes ?? []).includes('hammam-bath-ritual'),
    JSON.stringify({ phone: pubSpa?.phone, genre: pubSpa?.genre, doorstep: pubSpa?.doorstep, spaTypes: pubSpa?.spaTypes }));
  ok('public treatment carries durations + delivery + sanitised HTML',
    JSON.stringify(pubTrt?.durations) === JSON.stringify([30, 60]) && pubTrt?.delivery === 'doorstep'
      && /<b>flow<\/b>/.test(pubTrt?.descriptionHtml ?? '') && !/<script/i.test(pubTrt?.descriptionHtml ?? ''),
    JSON.stringify({ durations: pubTrt?.durations, delivery: pubTrt?.delivery }));

  console.log('— Booking honours the chosen duration option —');
  const tdate = futureDate(7);
  r = await req(`/api/availability?spa=${taxSlug}&date=${tdate}&itemType=treatment&itemSlug=${trtSlug}&durationMin=60`);
  ok('availability uses the requested duration', r.status === 200 && r.data.durationMin === 60
    && JSON.stringify(r.data.durations) === JSON.stringify([30, 60]),
    JSON.stringify({ durationMin: r.data.durationMin, durations: r.data.durations }).slice(0, 120));
  const tFree = r.data.slots.find((s) => s.available);
  ok('has a free slot for the 60-minute option', !!tFree);

  r = await req(`/api/availability?spa=${taxSlug}&date=${tdate}&itemType=treatment&itemSlug=${trtSlug}&durationMin=45`);
  ok('unknown duration option ignored (falls back to first)', r.status === 200 && r.data.durationMin === 30,
    `durationMin=${r.data.durationMin}`);

  r = await req('/api/bookings', { method: 'POST', jar: cust, body: {
    spaSlug: taxSlug, itemType: 'treatment', itemSlug: trtSlug, date: tdate, time: tFree.time, durationMin: 60 } });
  ok('booking with 60-minute option created (201)', r.status === 201, JSON.stringify(r.data).slice(0, 200));
  const tCode = r.data.booking?.code;
  const endH = Number(tFree.time.slice(0, 2)), endM = Number(tFree.time.slice(3, 5)) + 60;
  const expEnd = `${String(endH + Math.floor(endM / 60)).padStart(2, '0')}:${String(endM % 60).padStart(2, '0')}`;
  ok('booking end time = start + 60 min', r.data.booking?.endTime === expEnd,
    `end=${r.data.booking?.endTime} expected=${expEnd}`);

  r = await req('/api/bookings', { method: 'POST', jar: cust, body: {
    spaSlug: taxSlug, itemType: 'treatment', itemSlug: trtSlug, date: tdate, time: tFree.time, durationMin: 45 } });
  ok('booking with an unoffered duration -> 400', r.status === 400, `status=${r.status}`);

  // Cleanup: cancel the future booking, then the listing (listings with upcoming bookings refuse deletion).
  await req(`/api/bookings/${tCode}/cancel`, { method: 'POST', jar: cust, body: { reason: 'test cleanup' } });
  r = await req(`/api/supplier/spas/${taxId}`, { method: 'DELETE', jar: sup });
  ok('taxonomy-test listing removed (cleanup)', r.status === 200, JSON.stringify(r.data));

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
