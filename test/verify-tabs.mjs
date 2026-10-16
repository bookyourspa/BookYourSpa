/* Drives the supplier dashboard in a real DOM (jsdom): My listings → each sub-tab.
   Requires jsdom (npm i --no-save jsdom) and a local server (scripts/dev-server.sh start).
   BASE defaults to http://127.0.0.1:3000 — exits non-zero on any uncaught client error. */
import { JSDOM, VirtualConsole } from 'jsdom';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3000';
const errors = [];
const warnings = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, label, timeoutMs = 20000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    try { const v = fn(); if (v) return v; } catch (e) { last = e; }
    await sleep(150);
  }
  throw new Error(`timeout waiting for: ${label}${last ? ` (last: ${last.message})` : ''}`);
}

const steps = [];
const step = (msg) => { steps.push(msg); console.log(`✓ ${msg}`); };

// — 1. supplier session —
const login = await fetch(BASE + '/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-bys-csrf': '1' },
  body: JSON.stringify({ email: 'owner@aurora-wellness.com', password: 'Supplier@2026!' }),
});
if (!login.ok) { console.error('login failed', login.status); process.exit(1); }
const cookie = (login.headers.getSetCookie?.() ?? [login.headers.get('set-cookie')])
  .map((c) => c.split(';')[0]).find((c) => c.startsWith('bys_session='));
if (!cookie) { console.error('no session cookie'); process.exit(1); }
step('supplier logged in');

// — 2. dashboard HTML —
const pageRes = await fetch(BASE + '/supplier', { headers: { cookie } });
const html = await pageRes.text();
if (pageRes.status !== 200) { console.error('/supplier status', pageRes.status); process.exit(1); }
step(`/supplier served (${pageRes.status}, ${html.length} bytes)`);

// — 3. real DOM session —
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (e) => errors.push(`jsdomError: ${e.stack || e.message}`));
virtualConsole.on('error', (...args) => warnings.push(`console.error: ${args.map(String).join(' ').slice(0, 400)}`));
virtualConsole.on('warn', (...args) => warnings.push(`console.warn: ${args.map(String).join(' ').slice(0, 300)}`));

const dom = new JSDOM(html, {
  url: BASE + '/supplier',
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  virtualConsole,
});
const { window } = dom;
const doc = window.document;

window.addEventListener('error', (e) => errors.push(`window.error: ${e.error?.stack || e.message}`));
window.addEventListener('unhandledrejection', (e) => errors.push(`unhandledrejection: ${e.reason?.stack || e.reason}`));

// polyfills before external chunks start fetching
window.fetch = (input, init = {}) => {
  const href = typeof input === 'string' ? input : (input?.url ?? String(input));
  const url = new URL(href, window.location.href);
  const headers = new Headers(init.headers ?? {});
  headers.set('cookie', cookie);
  return fetch(url, { ...init, headers, redirect: 'manual' });
};
// Web streams / encoding globals the Next bundle expects — jsdom doesn't expose them.
for (const name of ['ReadableStream', 'WritableStream', 'TransformStream', 'TextEncoder', 'TextDecoder', 'structuredClone', 'queueMicrotask']) {
  if (!window[name] && globalThis[name]) window[name] = globalThis[name];
}
window.confirm = () => false; // never actually delete anything in the harness
window.alert = () => {};
window.scrollTo = () => {};
if (!window.matchMedia) {
  window.matchMedia = (q) => ({ matches: false, media: q, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false });
}
if (!window.IntersectionObserver) window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
if (!window.ResizeObserver) window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

const text = () => doc.body?.textContent ?? '';
const buttons = () => [...doc.querySelectorAll('button')];
const byText = (t) => buttons().find((b) => b.textContent.trim() === t);
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
const assert = (cond, msg) => { if (!cond) throw new Error(`assertion failed: ${msg}`); step(msg); };

try {
  // — 4. overview renders (regression: counts crash would land here as "Application error") —
  await waitFor(() => text().includes('Latest booking requests'), 'overview heading');
  assert(!text().includes('Application error'), 'overview renders, no client-side exception page');

  // — 5. My listings —
  const navListings = await waitFor(() => buttons().find((b) => /my listings/i.test(b.textContent)), 'My listings nav');
  click(navListings);
  const strip = await waitFor(() => {
    const labels = ['Booking', 'Treatment', 'Staff', 'Promotion', 'Review', 'Edit details'];
    const found = labels.map((l) => byText(l));
    return found.every(Boolean) ? { labels, found } : null;
  }, '6 tab controls on a listing card');
  assert(text().includes('Aurora Wellness House'), 'listing card shows the spa');
  assert(text().includes('treatments'), 'listing card shows per-listing counts');

  const trash = await waitFor(
    () => buttons().find((b) => (b.getAttribute('aria-label') ?? '').startsWith('Remove ')),
    'delete icon button',
  );
  assert(trash.textContent.trim() === '', 'delete control is icon-only (no text)');
  assert(!!trash.querySelector('svg'), 'delete control renders an SVG icon');
  // click it — confirm() is stubbed false, so this exercises the cancel path of the delete flow
  click(trash);
  await sleep(300);
  assert(text().includes('Aurora Wellness House'), 'delete icon click → confirm() cancel path, listing intact, no error');
  step('tab strip complete: Booking · Treatment · Staff · Promotion · Review · Edit details · 🗑');

  // — 6. each sub-tab panel —
  click(strip.found[0]);
  await waitFor(() => doc.querySelector('select') && text().includes('All bookings'), 'booking panel');
  assert(text().includes('bookings'), 'Booking tab → bookings list/filter');

  click(strip.found[1]);
  await waitFor(() => text().includes('Add treatment'), 'treatment panel');
  assert(!buttons().some((b) => b.textContent.includes('Hours & closures')),
    'Treatment tab → treatments only (no nested hours/packages pills)');

  click(strip.found[2]);
  await waitFor(() => text().includes('Add member'), 'staff panel');
  assert(text().includes('No team members yet') || /team members?/.test(text()), 'Staff tab → StaffPanel (empty state on fresh seed)');

  // role selector + conditional pay/POS fields
  click(byText('+ Add member'));
  await waitFor(() => text().includes('Add team member'), 'staff add modal');
  const roleSelect = [...doc.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'regular'));
  assert(!!roleSelect && ['admin', 'cashier', 'therapist', 'regular'].every((v) => [...roleSelect.options].some((o) => o.value === v)),
    'role selector offers Admin / Cashier / Therapist / Regular');
  assert(text().includes('Monthly salary') && text().includes('Incentive / services %'), 'pay fields present (salary + incentive)');
  assert(text().includes('Work / job fee %'), 'therapist (default) shows the work/job fee field');
  assert(!text().includes('Spa POS login access'), 'Spa POS access hidden for therapist');
  const setRole = (v) => { roleSelect.value = v; roleSelect.dispatchEvent(new window.Event('change', { bubbles: true })); };
  setRole('cashier');
  await waitFor(() => text().includes('Spa POS login access'), 'Spa POS access appears for cashier');
  assert(!text().includes('Work / job fee %'), 'work/job fee hidden for cashier');
  setRole('regular');
  await waitFor(() => !text().includes('Spa POS login access'), 'Spa POS access hidden for regular');
  assert(!text().includes('Work / job fee %'), 'work/job fee hidden for regular');
  const cancelBtn = [...doc.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Cancel');
  if (cancelBtn) click(cancelBtn);
  await waitFor(() => !text().includes('Add team member'), 'staff modal closed');

  click(strip.found[3]);
  await waitFor(() => text().includes('New promotion'), 'promotions panel');
  assert(text().includes('No promotions yet') || /promotions?/.test(text()), 'Promotion tab → PromotionsPanel');

  click(strip.found[4]);
  await waitFor(() => text().includes('Moderated before publishing') || text().includes('No reviews yet'), 'reviews panel');
  assert(text().includes('Moderated before publishing') || text().includes('No reviews yet'),
    'Review tab → ReviewsPanel (avg rating + moderated feed)');

  // — 7. Edit details opens the modal —
  click(strip.found[5]);
  await waitFor(() => text().includes('Edit listing'), 'edit modal');
  const cancel = buttons().find((b) => b.textContent.trim() === 'Cancel');
  if (cancel) click(cancel);

  // — 8. zero uncaught errors —
  if (errors.length) {
    console.error(`\n✗ ${errors.length} UNCAUGHT ERROR(S):`);
    for (const e of errors) console.error('---\n' + e);
    process.exit(1);
  }
  console.log(`\nwarnings captured: ${warnings.length}${warnings.length ? ' (non-fatal, listed below)' : ''}`);
  for (const w of warnings.slice(0, 5)) console.log('  · ' + w);
  console.log(`\nRESULT: ${steps.length} checks passed, 0 uncaught errors`);
  process.exit(0);
} catch (e) {
  console.error(`\n✗ FAILED: ${e.message}`);
  if (errors.length) { console.error('\nuncaught errors so far:'); errors.forEach((x) => console.error('---\n' + x)); }
  if (warnings.length) { console.error('\nconsole output:'); warnings.slice(0, 10).forEach((x) => console.error('  · ' + x)); }
  process.exit(1);
}
