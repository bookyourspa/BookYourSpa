import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pairs = [
  ['shared/content.ts', 'web/src/lib/content.ts'],
  ['shared/content.ts', 'worker/src/content.ts'],
];
for (const [from, to] of pairs) {
  const dest = resolve(root, to);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(resolve(root, from), dest);
  console.log(`synced ${from} -> ${to}`);
}
