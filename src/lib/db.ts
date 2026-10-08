import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

let _db: Database.Database | null = null;

function dbPath(): string {
  return path.resolve(process.cwd(), process.env.DATABASE_PATH || "./data/bookyourspa.db");
}

export function getDb(): Database.Database {
  if (_db) return _db;
  const DB_PATH = dbPath();
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  _db.pragma("busy_timeout = 5000");
  runMigrations(_db);
  return _db;
}

/** Applies any migrations/NNN_*.sql not yet recorded in schema_migrations. */
export function runMigrations(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  const dir = path.join(process.cwd(), "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const applied = new Set(db.prepare("SELECT name FROM schema_migrations").all().map((r: any) => r.name));
  for (const f of files) {
    if (applied.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    const tx = db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (name) VALUES (?)").run(f);
    });
    tx();
    console.log(`[db] applied migration ${f}`);
  }
}

/** Run fn inside an IMMEDIATE transaction (write lock acquired up-front). */
export function tx<T>(fn: () => T): T {
  const db = getDb();
  return db.transaction(fn).immediate();
}

/** Open a fresh connection (used by tests with a temp database). */
export function openDb(dbPath: string): Database.Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  runMigrations(db);
  return db;
}
