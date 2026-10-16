/* Production smoke for listing image uploads (cover + gallery).
   Creates a temp listing, uploads, verifies serving/caching/GC, deletes
   everything — no approvals, no residue. BASE defaults to production. */
const BASE = process.env.BASE ?? 'https://bookyourspa.net';
let pass = 0, fail = 0;
const failures = [];
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; failures.push(name); console.log(`  ✗ ${name} ${extra}`); }
};

const jar = { cookie: '' };
async function req(path, { method = 'GET', body, raw = false } = {}) {
  const headers = { 'content-type': 'application/json', 'x-bys-csrf': '1' };
  if (jar.cookie) headers.cookie = jar.cookie;
  const res = await fetch(BASE + path, {
    method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual',
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const sc of setCookie) {
    const kv = sc.split(';')[0];
    if (kv.startsWith('bys_session=')) jar.cookie = kv;
  }
  if (raw) return { res };
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

(async () => {
  console.log(`— image smoke against ${BASE} —`);
  let r = await req('/api/health');
  ok('api healthy (schema migration runs on boot)', r.status === 200 && r.data.ok === true);

  r = await req('/api/auth/login', { method: 'POST', body: { email: 'owner@aurora-wellness.com', password: 'Supplier@2026!' } });
  ok('demo supplier logs in', r.status === 200 && r.data.user?.role === 'supplier', `status=${r.status}`);

  const UNIQUE = Date.now().toString(36);
  const flow = {
    name: `Image Smoke ${UNIQUE}`, destination: 'london', city: 'Bath', country: 'United Kingdom',
    address: '5 Smoke Test Lane, Bath BA1 2AA',
    summary: 'Temporary listing proving cover and gallery uploads on production.',
  };
  r = await req('/api/supplier/spas', { method: 'POST', body: flow });
  ok('temp listing created (pending)', r.status === 201, JSON.stringify(r.data));
  const spaId = r.data.id, spaSlug = r.data.slug;

  try {
    r = await req('/api/img/img_doesnotexist99', { raw: true });
    ok('unknown image id -> 404', r.res.status === 404, `status=${r.res.status}`);

    r = await req(`/api/supplier/spas/${spaId}/images`, { method: 'POST', body: { dataUrl: 'data:image/png;base64,' + Buffer.from('nope').toString('base64') } });
    ok('non-image bytes rejected (400)', r.status === 400, JSON.stringify(r.data));

    r = await req(`/api/supplier/spas/${spaId}/images`, { method: 'POST', body: { dataUrl: `data:image/png;base64,${TINY_PNG}` } });
    ok('cover image uploaded (201)', r.status === 201 && /^\/api\/img\/img_/.test(r.data?.url ?? ''), JSON.stringify(r.data));
    const upUrl = r.data.url, upId = r.data.id;

    const imgRes = await fetch(BASE + upUrl);
    const bytes = Buffer.from(await imgRes.arrayBuffer());
    ok('uploaded image serves exact bytes (image/png)',
      imgRes.status === 200 && imgRes.headers.get('content-type') === 'image/png' && bytes.equals(Buffer.from(TINY_PNG, 'base64')),
      `status=${imgRes.status} type=${imgRes.headers.get('content-type')} bytes=${bytes.length}`);
    ok('immutable cache headers', (imgRes.headers.get('cache-control') ?? '').includes('immutable'));
    const reval = await fetch(BASE + upUrl, { headers: { 'if-none-match': `"${upId}"` } });
    ok('etag revalidation -> 304', reval.status === 304, `status=${reval.status}`);

    r = await req(`/api/supplier/spas/${spaId}/images`, { method: 'POST', body: { dataUrl: `data:image/png;base64,${TINY_PNG}` } });
    const dropUrl = r.data.url;
    ok('second upload ok', r.status === 201, JSON.stringify(r.data));

    r = await req(`/api/supplier/spas/${spaId}`, { method: 'PATCH', body: { ...flow, image: upUrl, gallery: [upUrl, '/images/spa/zen-hands.jpg'] } });
    ok('listing saved with cover + gallery (200)', r.status === 200, JSON.stringify(r.data));

    r = await req(dropUrl, { raw: true });
    ok('unreferenced upload collected on save', r.res.status === 404, `status=${r.res.status}`);
    r = await req(upUrl, { raw: true });
    ok('referenced upload kept', r.res.status === 200, `status=${r.res.status}`);

    r = await req('/api/supplier/spas');
    const row = r.data.items.find((s) => s.id === spaId);
    ok('supplier list carries uploaded cover + gallery',
      row?.image === upUrl && (row?.gallery ?? []).includes(upUrl),
      JSON.stringify({ image: row?.image, gallery: row?.gallery }));

    r = await req(`/api/spas/${spaSlug}`, { raw: true });
    ok('pending listing stays hidden publicly', r.res.status === 404, `status=${r.res.status}`);
  } finally {
    r = await req(`/api/supplier/spas/${spaId}`, { method: 'DELETE' });
    ok('temp listing deleted (cascade cleanup)', r.status === 200, JSON.stringify(r.data));
    r = await req('/api/supplier/spas');
    ok('supplier list clean after delete', r.status === 200 && !r.data.items.some((s) => s.id === spaId),
      `status=${r.status} ids=${JSON.stringify(r.data.items?.map((s) => s.id))}`);
  }

  // regressions: static + DB-only pages, gallery rendering on the live site
  const aurora = await fetch(`${BASE}/spas/aurora-wellness-house/`);
  const auroraHtml = await aurora.text();
  ok('static listing page 200 with gallery', aurora.status === 200 && auroraHtml.includes('alt="Aurora Wellness House — photo 1"'),
    `status=${aurora.status}`);
  const dubai = await fetch(`${BASE}/spas/dubai-spa-at-home/`);
  ok('DB-only listing still 200', dubai.status === 200, `status=${dubai.status}`);
})().catch((e) => { console.error(e); fail++; failures.push(String(e?.message ?? e)); process.exit(1); });

process.on('exit', () => {
  console.log(`\nRESULT: ${pass} passed, ${fail} failed${fail ? ' — ' + failures.join(' | ') : ''}`);
  process.exitCode = fail ? 1 : 0;
});
