/** D1 bootstrap: schema, settings cache and content seeding. */
import { SCHEMA_SQL } from './schema';
import { DEFAULT_SETTINGS, SPAS, OFFERS, FAQS, REVIEWS, SEED_ACCOUNTS, TREATMENT_CATALOG, PACKAGE_CATALOG } from './content';
import { hashPassword, verifyPassword } from './auth';
import { newId, nowIso, randomToken } from './util';

let schemaReady = false;
let lastSchemaCheck = 0;

const SCHEMA_VERSION = 5;
const MIGRATIONS: Record<number, string[]> = {
  2: [
    'ALTER TABLE offers ADD COLUMN spa_id TEXT',
    `CREATE TABLE IF NOT EXISTS staff (
      id TEXT PRIMARY KEY,
      spa_id TEXT NOT NULL REFERENCES spas(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'Therapist',
      phone TEXT,
      email TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    )`,
    'CREATE INDEX IF NOT EXISTS idx_staff_spa ON staff(spa_id)',
  ],
  3: [
    'ALTER TABLE staff ADD COLUMN monthly_salary REAL',
    'ALTER TABLE staff ADD COLUMN incentive_percent REAL',
    'ALTER TABLE staff ADD COLUMN work_fee_percent REAL',
    'ALTER TABLE staff ADD COLUMN pos_login INTEGER NOT NULL DEFAULT 0',
  ],
  4: [
    `CREATE TABLE IF NOT EXISTS listing_images (
      id TEXT PRIMARY KEY,
      spa_id TEXT NOT NULL REFERENCES spas(id) ON DELETE CASCADE,
      mime TEXT NOT NULL,
      data BLOB NOT NULL,
      created_at TEXT NOT NULL
    )`,
    'CREATE INDEX IF NOT EXISTS idx_listing_images_spa ON listing_images(spa_id)',
  ],
  5: [
    // Listing taxonomy + contact (Google Maps import fills phone/email/website).
    `ALTER TABLE spas ADD COLUMN phone TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE spas ADD COLUMN email TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE spas ADD COLUMN website TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE spas ADD COLUMN maps_url TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE spas ADD COLUMN spa_categories TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE spas ADD COLUMN spa_types TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE spas ADD COLUMN genre TEXT NOT NULL DEFAULT 'both'`,
    `ALTER TABLE spas ADD COLUMN doorstep INTEGER NOT NULL DEFAULT 0`,
    // Treatments: rich-text description, multiple duration options, spa type, genre, delivery.
    `ALTER TABLE treatments ADD COLUMN description_html TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE treatments ADD COLUMN durations TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE treatments ADD COLUMN spa_type TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE treatments ADD COLUMN genre TEXT NOT NULL DEFAULT 'both'`,
    `ALTER TABLE treatments ADD COLUMN delivery TEXT NOT NULL DEFAULT 'both'`,
    // Packages: multi spa types, genre, delivery.
    `ALTER TABLE packages ADD COLUMN spa_types TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE packages ADD COLUMN genre TEXT NOT NULL DEFAULT 'both'`,
    `ALTER TABLE packages ADD COLUMN delivery TEXT NOT NULL DEFAULT 'both'`,
  ],
};

export async function ensureSchema(db: D1Database) {
  if (schemaReady && Date.now() - lastSchemaCheck < 1000 * 60 * 30) return;
  let probe: string | null = null;
  try {
    probe = await db.prepare("SELECT value FROM settings WHERE key = 'schema_version'").first<string>();
  } catch {
    probe = null; // settings table does not exist yet
  }
  if (!probe) {
    const statements = SCHEMA_SQL.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
    for (let i = 0; i < statements.length; i += 40) {
      await db.batch(statements.slice(i, i + 40).map((sql) => db.prepare(sql)));
    }
    await db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('schema_version', '${SCHEMA_VERSION}')`).run();
  } else {
    // Existing database: apply migrations strictly in order, one version at a time.
    let from = Number(probe);
    if (!Number.isFinite(from) || from < 1) from = 1;
    for (let version = from + 1; version <= SCHEMA_VERSION; version++) {
      for (const sql of MIGRATIONS[version] ?? []) {
        try {
          await db.prepare(sql).run();
        } catch (err) {
          // Another isolate may have applied the same statement first; only
          // duplicate-object errors are safe to ignore — anything else is real.
          if (!/duplicate column|already exists/i.test(String(err))) throw err;
        }
      }
      await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('schema_version', ?)").bind(String(version)).run();
    }
  }
  schemaReady = true;
  lastSchemaCheck = Date.now();
}

/* ---------- settings with a short per-isolate cache ---------- */

let settingsCache: Record<string, string> | null = null;
let settingsAt = 0;

export async function getSettings(db: D1Database): Promise<Record<string, string>> {
  if (settingsCache && Date.now() - settingsAt < 8000) return settingsCache;
  const rows = await db.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>();
  const map: Record<string, string> = {};
  for (const r of rows.results) map[r.key] = r.value;
  settingsCache = map;
  settingsAt = Date.now();
  return map;
}

export const invalidateSettings = () => { settingsCache = null; settingsAt = 0; };

export async function setSetting(db: D1Database, key: string, value: string) {
  await db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, value).run();
  settingsCache = null;
}

export const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/* ---------- seeding ---------- */

async function ensureUser(
  db: D1Database,
  email: string,
  password: string,
  role: string,
  name: string,
  phone: string | null = null
): Promise<string> {
  const found = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: string }>();
  if (found) return found.id;
  const id = newId('usr');
  await db
    .prepare('INSERT INTO users (id, email, password_hash, role, name, phone, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, email, await hashPassword(password), role, name, phone, 'active', nowIso(), nowIso())
    .run();
  return id;
}

const SPA_OWNER_PASSWORD = 'Supplier@2026!';

export async function runSeed(db: D1Database, opts: { force?: boolean } = {}): Promise<{ seeded: boolean; note: string }> {
  const already = await db.prepare("SELECT value FROM settings WHERE key = 'seeded'").first<string>();
  if (already === '1' && !opts.force) return { seeded: false, note: 'already seeded' };
  if (opts.force) await db.prepare("DELETE FROM settings WHERE key = 'seeded'").run();

  // Atomically claim the seed run so parallel isolates never double-insert.
  const claim = await db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('seeded', 'running')").run();
  if (!claim.meta.changes && already !== '1' && !opts.force) {
    return { seeded: false, note: 'seed already claimed' };
  }

  const at = nowIso();
  const batch: D1PreparedStatement[] = [];

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    batch.push(db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').bind(key, String(value)));
  }

  // --- accounts ---
  const adminId = await ensureUser(db, SEED_ACCOUNTS.admin.email, SEED_ACCOUNTS.admin.password, 'admin', SEED_ACCOUNTS.admin.name);
  await ensureUser(db, SEED_ACCOUNTS.customer.email, SEED_ACCOUNTS.customer.password, 'customer', SEED_ACCOUNTS.customer.name, '+1 (212) 555-0177');
  const demoSupplierUserId = await ensureUser(db, SEED_ACCOUNTS.supplier.email, SEED_ACCOUNTS.supplier.password, 'supplier', SEED_ACCOUNTS.supplier.name, '+44 20 7946 0102');
  const pendingSupplierUserId = await ensureUser(db, 'manager@cedarsprings.example.com', SPA_OWNER_PASSWORD, 'supplier', 'Jonah Fields', '+44 1225 555 019');

  // --- one approved supplier per spa (demo supplier owns Aurora) ---
  const supplierIdsBySpa: Record<string, string> = {};
  for (const spa of SPAS) {
    const ownerEmail = spa.slug === 'aurora-wellness-house'
      ? SEED_ACCOUNTS.supplier.email
      : `owner@${spa.slug.replace(/-/g, '')}.example.com`;
    const ownerName = spa.slug === 'aurora-wellness-house' ? SEED_ACCOUNTS.supplier.name : `${spa.name} Managing Director`;
    const userId = await ensureUser(db, ownerEmail, SPA_OWNER_PASSWORD, 'supplier', ownerName);
    const existing = await db.prepare('SELECT id FROM suppliers WHERE user_id = ?').bind(userId).first<{ id: string }>();
    let supplierId = existing?.id;
    if (!supplierId) {
      supplierId = newId('sup');
      batch.push(
        db.prepare('INSERT INTO suppliers (id, user_id, company_name, contact_name, country, website, status, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(supplierId, userId, `${spa.name} Ltd`, ownerName, spa.country, `https://${spa.slug}.example.com`, 'approved', null, at)
      );
    }
    supplierIdsBySpa[spa.id] = supplierId!;
  }

  // pending supplier registration awaiting admin approval
  const pendingSupplierId = newId('sup');
  batch.push(
    db.prepare('INSERT OR IGNORE INTO suppliers (id, user_id, company_name, contact_name, country, website, status, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(pendingSupplierId, pendingSupplierUserId, 'Cedar Springs Bathhouse', 'Jonah Fields', 'United Kingdom', 'https://cedarsprings.example.com', 'pending', 'Registered via supplier portal — awaiting review.', at)
  );

  // --- spas ---
  for (const spa of SPAS) {
    batch.push(
      db.prepare(`INSERT OR IGNORE INTO spas (id, supplier_id, slug, name, destination, city, country, address, summary, description, image, gallery, facilities, categories, price_level, rating, review_count, featured, lat, lng, hours, status, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(spa.id, supplierIdsBySpa[spa.id], spa.slug, spa.name, spa.destination, spa.city, spa.country, spa.address,
          spa.summary, JSON.stringify(spa.description), spa.image, JSON.stringify(spa.gallery), JSON.stringify(spa.facilities),
          JSON.stringify(spa.categories), spa.priceLevel, spa.rating, spa.reviewCount, spa.featured ? 1 : 0,
          spa.lat, spa.lng, JSON.stringify(spa.hours), 'approved', at, at)
    );

    for (const t of spa.treatments) {
      const catalog = TREATMENT_CATALOG.find((c) => c.slug === t.slug);
      if (!catalog) continue;
      batch.push(
        db.prepare('INSERT OR IGNORE INTO treatments (id, spa_id, slug, name, category, description, duration_min, price, image, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)')
          .bind(newId('trt'), spa.id, catalog.slug, catalog.name, catalog.category, catalog.description, catalog.duration, t.price, catalog.image, at)
      );
    }
    for (const p of spa.packages) {
      const catalog = PACKAGE_CATALOG.find((c) => c.slug === p.slug);
      if (!catalog) continue;
      batch.push(
        db.prepare('INSERT OR IGNORE INTO packages (id, spa_id, slug, name, description, includes, duration_min, price, image, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)')
          .bind(newId('pkg'), spa.id, catalog.slug, catalog.name, catalog.blurb, JSON.stringify(catalog.includes), catalog.duration, p.price, catalog.image, at)
      );
    }
    spa.hours.forEach((h, day) => {
      batch.push(
        db.prepare('INSERT OR IGNORE INTO availability_rules (id, spa_id, day_of_week, open_time, close_time, closed) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(newId('avl'), spa.id, day, h.open, h.close, h.closed ? 1 : 0)
      );
    });
  }

  // a pending listing for the admin approval queue
  batch.push(
    db.prepare(`INSERT OR IGNORE INTO spas (id, supplier_id, slug, name, destination, city, country, address, summary, description, image, gallery, facilities, categories, price_level, rating, review_count, featured, lat, lng, hours, status, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 3, 0, 0, 0, ?, ?, ?, 'pending', ?, ?)`)
      .bind('spa-cedar', pendingSupplierId, 'cedar-springs-bathhouse', 'Cedar Springs Bathhouse', 'london', 'Bath', 'United Kingdom',
        '12 Hot Wall Parade, Bath BA1 5NJ', 'Geothermal Roman-inspired baths with a modern wellness wing.',
        JSON.stringify(['A family-run bathhouse bringing Bath’s geothermal springs into a calm, contemporary wellness house.']),
        '/images/spa/zenith-sauna.jpg', JSON.stringify(['/images/spa/zenith-sauna.jpg']), JSON.stringify(['Geothermal pools', 'Sauna', 'Steam']),
        JSON.stringify(['thermal', 'hydro']), 51.3811, -2.3590, JSON.stringify([
          { open: '09:00', close: '20:00', closed: false }, { open: '09:00', close: '20:00', closed: false },
          { open: '09:00', close: '20:00', closed: false }, { open: '09:00', close: '20:00', closed: false },
          { open: '09:00', close: '21:00', closed: false }, { open: '09:00', close: '21:00', closed: false },
          { open: '10:00', close: '18:00', closed: false }]), at, at)
  );

  // --- offers / faqs / reviews ---
  for (const o of OFFERS) {
    batch.push(
      db.prepare('INSERT OR IGNORE INTO offers (id, code, title, description, discount_type, value, min_spend, destination, starts_at, ends_at, image, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)')
        .bind(`off_${o.code}`, o.code, o.title, o.description, o.discountType, o.value, o.minSpend, o.destination, o.startsAt, o.endsAt, o.image)
    );
  }
  FAQS.forEach((f, i) => {
    batch.push(
      db.prepare('INSERT OR IGNORE INTO faqs (id, question, answer, sort, active) VALUES (?, ?, ?, ?, 1)')
        .bind(`faq_${i}`, f.q, f.a, i)
    );
  });
  REVIEWS.forEach((r, i) => {
    const spa = SPAS.find((s) => s.slug === r.spaSlug);
    if (!spa) return;
    batch.push(
      db.prepare('INSERT OR IGNORE INTO reviews (id, spa_id, user_id, booking_id, name, city, rating, title, body, status, created_at) VALUES (?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?)')
        .bind(`rev_${spa.id}_${i}`, spa.id, r.name, r.city, r.rating, r.title, r.body, 'approved', r.date + 'T10:00:00.000Z')
    );
  });

  for (let i = 0; i < batch.length; i += 80) {
    await db.batch(batch.slice(i, i + 80));
  }

  await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('seeded', '1')").run();
  settingsCache = null;
  return { seeded: true, note: `seeded ${SPAS.length} spas` };
}
