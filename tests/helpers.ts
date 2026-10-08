/**
 * Test helper: builds an isolated temp database with migrations + minimal
 * fixture data (spa, branch, rooms, treatment, therapists with schedules).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { runMigrations } from "../src/lib/db";

export interface Fixture {
  db: Database.Database;
  dbPath: string;
  userIds: { customer: number; supplier: number; admin: number };
  supplierId: number;
  spaId: number;
  branchId: number;
  treatmentId: number;
  roomIds: number[];
  therapistIds: number[];
  cleanup: () => void;
}

const HOUR = JSON.stringify({ mon: ["09:00", "21:00"], tue: ["09:00", "21:00"], wed: ["09:00", "21:00"], thu: ["09:00", "21:00"], fri: ["09:00", "21:00"], sat: ["09:00", "21:00"], sun: ["09:00", "21:00"] });

export function makeFixture(): Fixture {
  const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "bys-test-")), "test.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);

  const uid = (email: string, role: string, adminLevel: string | null = null) =>
    Number(db.prepare(
      "INSERT INTO users (email, password_hash, role, admin_level, full_name) VALUES (?,?,?,?,'Test User')"
    ).run(email, "scrypt:aa:bb", role, adminLevel).lastInsertRowid);

  const customer = uid("customer@test.local", "customer");
  const supplierUser = uid("supplier@test.local", "supplier");
  const admin = uid("admin@test.local", "admin", "super");

  const supplierId = Number(db.prepare(
    "INSERT INTO suppliers (user_id, business_name, status) VALUES (?,?, 'approved')"
  ).run(supplierUser, "Test Spa Co").lastInsertRowid);

  const spaId = Number(db.prepare(
    `INSERT INTO spas (supplier_id, slug, name, status, opening_hours, cancel_hours)
     VALUES (?,?,?, 'published', ?, 24)`
  ).run(supplierId, "test-spa", "Test Spa", HOUR).lastInsertRowid);

  const branchId = Number(db.prepare(
    "INSERT INTO branches (spa_id, name, opening_hours) VALUES (?,?,?)"
  ).run(spaId, "Main", HOUR).lastInsertRowid);

  const roomIds = [1, 2].map((n) =>
    Number(db.prepare("INSERT INTO rooms (branch_id, name, capacity) VALUES (?,?,2)").run(branchId, `Room ${n}`).lastInsertRowid)
  );

  const treatmentId = Number(db.prepare(
    `INSERT INTO treatments (spa_id, slug, name, duration_min, price, currency, min_guests, max_guests,
       room_required, buffer_min, home_service, travel_fee, status)
     VALUES (?,?,?,60,300000,'IDR',1,4,1,0,1,100000,'active')`
  ).run(spaId, "balinese-massage", "Balinese Massage").lastInsertRowid);
  db.prepare("INSERT INTO treatment_branches (treatment_id, branch_id) VALUES (?,?)").run(treatmentId, branchId);

  const therapistIds = ["Ayu", "Sari", "Wayan"].map((name, i) => {
    const id = Number(db.prepare(
      "INSERT INTO therapists (spa_id, branch_id, name, gender, status) VALUES (?,?,?,?, 'active')"
    ).run(spaId, i === 2 ? null : branchId, name, i % 2 === 0 ? "female" : "male").lastInsertRowid);
    for (const wd of [0, 1, 2, 3, 4, 5, 6]) {
      db.prepare("INSERT INTO therapist_schedules (therapist_id, weekday, start_time, end_time) VALUES (?,?,?,?)")
        .run(id, wd, "09:00", "21:00");
    }
    db.prepare("INSERT INTO therapist_treatments (therapist_id, treatment_id) VALUES (?,?)").run(id, treatmentId);
    return id;
  });

  db.prepare("INSERT INTO settings (key, value) VALUES ('commission_rate','10')").run();
  db.prepare("INSERT INTO settings (key, value) VALUES ('tax_rate','0')").run();
  db.prepare("INSERT INTO settings (key, value) VALUES ('service_fee_rate','0')").run();

  return {
    db, dbPath,
    userIds: { customer, supplier: supplierUser, admin },
    supplierId, spaId, branchId, treatmentId, roomIds, therapistIds,
    cleanup: () => {
      try { db.close(); } catch { /* ignore */ }
      try { fs.rmSync(path.dirname(dbPath), { recursive: true, force: true }); } catch { /* ignore */ }
    },
  };
}
