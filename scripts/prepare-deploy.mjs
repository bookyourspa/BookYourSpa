/**
 * Assembles the deploy/ bundle:
 *  1. copies web/out -> deploy/public (static site)
 *  2. sanitises asset paths containing ( ) [ ]  (rejected by the deploy validator)
 *     and rewrites every reference to them in HTML/JS/TXT payloads
 *  3. copies the bundled worker (built with `wrangler deploy --dry-run`)
 *  4. writes manifest.json
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'web', 'out');
const DST = join(root, 'deploy');
const PUB = join(DST, 'public');
const SPECIALS = /[()[\]]/;

if (!existsSync(SRC)) { console.error('web/out missing — run next build first'); process.exit(1); }

rmSync(DST, { recursive: true, force: true });
mkdirSync(DST, { recursive: true });
cpSync(SRC, PUB, { recursive: true });

// --- 1. rename files/dirs containing special characters (bottom-up) ---
const walk = (dir, out = []) => {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) { walk(p, out); out.push(p); }
    else out.push(p);
  }
  return out;
};
const sanitize = (name) => name.replace(/[()[\]]/g, '_');
const renames = [];
const specialDirs = new Set();
for (const p of walk(PUB)) {
  const base = p.split('/').pop();
  if (SPECIALS.test(base)) renames.push(p);
  if (statSync(p).isDirectory()) {
    const rel = p.slice(PUB.length + 1);
    if (SPECIALS.test(rel)) specialDirs.add(rel);
  }
}
for (const p of renames.sort((a, b) => b.length - a.length)) {
  renameSync(p, join(dirname(p), sanitize(p.split('/').pop())));
}
console.log(`renamed ${renames.length} files/dirs`);

// --- 2. rewrite references inside text assets ---
const patterns = []; // [search, replace] pairs
const encodeSeg = (str) => str.replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\[/g, '%5B').replace(/\]/g, '%5D');
for (const rel of specialDirs) {
  const segs = rel.split('/');
  for (let i = 0; i < segs.length; i++) {
    const suffix = segs.slice(i).join('/');
    if (!SPECIALS.test(suffix)) continue;
    const clean = sanitize(suffix);
    patterns.push([suffix, clean]);
    const enc = encodeSeg(suffix);
    if (enc !== suffix) patterns.push([enc, clean]);
  }
}
const uniq = new Map();
for (const [a, b] of patterns) if (!uniq.has(a)) uniq.set(a, b);
patterns.length = 0;
patterns.push(...uniq.entries());
console.log('rewrite patterns:', patterns.map(([a]) => a).join(' | '));

patterns.sort((a, b) => b.length - a.length);

const TEXT = new Set(['.html', '.js', '.txt', '.css', '.xml', '.json', '.svg', '.rsc', '.md']);
let rewritten = 0, touched = 0;
for (const p of walk(PUB)) {
  if (statSync(p).isDirectory()) continue;
  const ext = p.slice(p.lastIndexOf('.'));
  if (!TEXT.has(ext)) continue;
  const before = readFileSync(p, 'utf8');
  let after = before;
  for (const [pat, rep] of patterns) {
    if (after.includes(pat)) after = after.split(pat).join(rep);
  }
  if (after !== before) { writeFileSync(p, after); rewritten++; }
  // leftover check: any asset-path-looking string with special chars?
  const leftover = /_next\/static\/(chunks|media|css)[^"' )]*[()[\]]|%5Bslug%5D|%28site%29/.test(after);
  if (leftover) { touched++; console.warn('  ! special chars remain in asset path:', p); }
}
console.log(`rewrote references in ${rewritten} files (${touched} with leftovers)`);

// --- 3. worker bundle ---
const workerSrc = join(root, 'worker', 'dist', 'index.js');
if (existsSync(workerSrc)) {
  const code = readFileSync(workerSrc, 'utf8').split('\n').filter((l) => !l.includes('sourceMappingURL')).join('\n');
  writeFileSync(join(DST, 'worker.js'), code);
} else {
  console.error('worker bundle missing — run `npm run bundle -w @bookyourspa/worker` first');
  process.exit(1);
}

// --- 4. manifest ---
writeFileSync(join(DST, 'manifest.json'), JSON.stringify({
  entrypoint: 'index.js',
  compatibilityDate: '2026-09-01',
  modules: [{ name: 'index.js', type: 'esm', path: './worker.js' }],
  assetsDirectory: './public',
  spa: false,
}, null, 2));

const size = walk(PUB).filter((p) => statSync(p).isFile()).length;
console.log(`deploy ready: ${size} assets, worker.js present, manifest.json written`);
