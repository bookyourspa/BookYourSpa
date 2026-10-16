/* Spa detail page regressions:
   1. statically exported listing pages still render their own content
   2. DB-only listings (created after the export) get the worker's fallback
      shell: HTTP 200 with corrected title/meta, and a real DOM boot swaps in
      the correct content from /api/spas/<slug> with zero uncaught errors.
   Local runs also insert the DB-only test row (clone of a seeded listing). */
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3000';
const LOCAL = !process.env.BASE;
const STATIC_SLUG = 'aurora-wellness-house';
const STATIC_NAME = 'Aurora Wellness House';
const DB_ONLY_SLUG = process.env.DB_ONLY_SLUG ?? 'testfix-spa';
const DB_ONLY_NAME = process.env.DB_ONLY_NAME ?? 'Testfix Spa Created After Build';

let pass = 0, fail = 0; const failures = [];
const ok = (n, c, x = '') => { c ? (pass++, console.log(`  ✓ ${n}`)) : (fail++, failures.push(n), console.log(`  ✗ ${n} ${x}`)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* — local: ensure the DB-only row exists (clone of the static listing) — */
if (LOCAL) {
  try {
    const { DatabaseSync } = await import('node:sqlite');
    const dir = 'worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject';
    const file = existsSync(dir) ? readdirSync(dir).find((f) => f.endsWith('.sqlite') && !f.startsWith('metadata')) : null;
    if (file) {
      const db = new DatabaseSync(`${dir}/${file}`);
      const aurora = db.prepare('SELECT * FROM spas WHERE slug = ?').get(STATIC_SLUG);
      // must not share aurora's supplier — tests assert that supplier owns 1 spa
      const other = db.prepare('SELECT id FROM suppliers WHERE id != ? ORDER BY id LIMIT 1').get(aurora.supplier_id);
      const has = db.prepare('SELECT 1 AS x FROM spas WHERE slug = ?').get(DB_ONLY_SLUG);
      if (!has) {
        const cols = db.prepare('PRAGMA table_info(spas)').all().map((c) => c.name);
        db.prepare(`INSERT INTO spas (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
          .run(...cols.map((c) => {
            if (c === 'id') return 'spa-db-only';
            if (c === 'slug') return DB_ONLY_SLUG;
            if (c === 'name') return DB_ONLY_NAME;
            if (c === 'supplier_id') return other.id;
            return aurora[c];
          }));
        console.log(`  · inserted local DB-only row ${DB_ONLY_SLUG}`);
      } else {
        // self-repair: keep name/status current and owned by a non-aurora supplier
        db.prepare('UPDATE spas SET name = ?, status = ?, supplier_id = ? WHERE slug = ?')
          .run(DB_ONLY_NAME, 'approved', other.id, DB_ONLY_SLUG);
      }
      // clone treatments so the menu + booking widget have live items to render
      // (key by the row's ACTUAL id — it may pre-exist from an earlier insert)
      const dbo = db.prepare('SELECT id FROM spas WHERE slug = ?').get(DB_ONLY_SLUG);
      const tCount = db.prepare('SELECT COUNT(*) AS c FROM treatments WHERE spa_id = ?').get(dbo.id).c;
      if (!tCount) {
        const tCols = db.prepare('PRAGMA table_info(treatments)').all().map((c) => c.name).filter((c) => c !== 'spa_id');
        const ts = db.prepare('SELECT * FROM treatments WHERE spa_id = ?').all(aurora.id);
        const ins = db.prepare(`INSERT OR IGNORE INTO treatments (spa_id, ${tCols.join(',')}) VALUES (?, ${tCols.map(() => '?').join(',')})`);
        for (const t of ts) ins.run(dbo.id, ...tCols.map((c) => (c === 'id' ? `trt-dbo-${t.id}` : t[c])));
        console.log(`  · cloned ${ts.length} treatments onto ${DB_ONLY_SLUG}`);
      }
      db.close();
    }
  } catch (e) {
    console.log(`  · skipped local row insert (${String(e.message).slice(0, 60)})`);
  }
}

/* — HTTP checks — */
const staticRes = await fetch(`${BASE}/spas/${STATIC_SLUG}/`);
const staticHtml = await staticRes.text();
ok('static listing page still 200', staticRes.status === 200, `got ${staticRes.status}`);
ok('static page keeps its own content', staticHtml.includes(STATIC_NAME));
ok('static page keeps its JSON-LD', staticHtml.includes('application/ld+json'));

const res = await fetch(`${BASE}/spas/${DB_ONLY_SLUG}/`);
const html = await res.text();
ok('DB-only listing page serves 200 (was 404)', res.status === 200, `got ${res.status} bytes=${html.length}`);
ok('shell serves the fallback loading state', html.includes('Loading listing'), html.slice(0, 200));
ok('no foreign JSON-LD in fallback shell', !html.includes('application/ld+json'));

const missing = await fetch(`${BASE}/spas/no-such-spa-at-all/`);
ok('unknown slug still 404s', missing.status === 404, `got ${missing.status}`);
const pending = await fetch(`${BASE}/spas/cedar-springs-bathhouse/`);
ok('pending listing still 404s', pending.status === 404, `got ${pending.status}`);

if (fail) {
  console.log(`\nRESULT: ${pass} passed, ${fail} failed${fail ? ' — ' + failures.join(' | ') : ''}`);
  process.exit(1);
}

/* — real DOM boot at the DB-only URL — */
const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (e) => errors.push('jsdomError: ' + String(e.message).slice(0, 200)));
virtualConsole.on('error', (...a) => errors.push('console.error: ' + a.map(String).join(' ').slice(0, 200)));
const dom = new JSDOM(html, {
  url: `${BASE}/spas/${DB_ONLY_SLUG}/`,
  runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole,
});
const { window } = dom;
window.addEventListener('error', (e) => errors.push('window.error: ' + String(e.error?.message || e.message).slice(0, 200)));
window.addEventListener('unhandledrejection', (e) => errors.push('unhandledrejection: ' + String(e.reason?.message || e.reason).slice(0, 200)));
for (const n of ['ReadableStream', 'WritableStream', 'TransformStream', 'TextEncoder', 'TextDecoder', 'structuredClone', 'queueMicrotask']) {
  if (!window[n] && globalThis[n]) window[n] = globalThis[n];
}
window.fetch = (input, init = {}) => {
  const href = typeof input === 'string' ? input : (input?.url ?? String(input));
  return globalThis.fetch(new URL(href, window.location.href), { ...init, redirect: 'manual' });
};
window.scrollTo = () => {};
if (!window.matchMedia) window.matchMedia = (q) => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false });
if (!window.IntersectionObserver) window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
if (!window.ResizeObserver) window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

const text = () => (window.document.body?.textContent ?? '').replace(/\s+/g, ' ');
let swapped = false;
for (let i = 0; i < 80 && !swapped; i++) {
  await sleep(150);
  swapped = text().includes(DB_ONLY_NAME) && !text().includes('Loading listing');
}
ok('fallback boots at the DB-only URL', errors.length === 0, errors.slice(0, 3).join(' | '));
ok('content swaps to the DB-only listing', swapped, text().slice(0, 200));
ok('shell does not keep foreign listing content', !text().includes(STATIC_NAME), text().slice(0, 200));
const apiNow = await (await fetch(`${BASE}/api/spas/${DB_ONLY_SLUG}`)).json();
const expectMenu = (apiNow.treatments?.length ?? 0) > 0;
ok(expectMenu ? 'treatments rendered from live data' : 'empty menu shows the coming-soon state',
  expectMenu ? text().includes('Menu & prices') : text().includes('Menu coming soon'),
  text().slice(0, 300));
ok('booking widget mounted', !!window.document.querySelector('#book'));
ok('title tag set for the listing', window.document.title.includes(DB_ONLY_NAME), window.document.title);
const canon = window.document.querySelector('link[rel="canonical"]');
ok('canonical points at the DB-only slug', !!canon && canon.href.includes(`/spas/${DB_ONLY_SLUG}/`), canon?.href);

console.log(`\nRESULT: ${pass} passed, ${fail} failed${fail ? ' — ' + failures.join(' | ') : ''}`);
process.exit(fail ? 1 : 0);
