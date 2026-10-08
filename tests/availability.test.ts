/**
 * Availability engine tests.
 *
 * Each test file gets its own temp database; DATABASE_PATH must be set
 * BEFORE src modules are imported (they read env at first connection).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeFixture, Fixture } from "./helpers";

let fx: Fixture;
let availability: typeof import("../src/lib/availability");
let booking: typeof import("../src/lib/booking");

// Pick a fixed future date with a known weekday (2026-10-12 = Monday)
const DATE = "2026-10-12";

beforeAll(async () => {
  fx = makeFixture();
  process.env.DATABASE_PATH = fx.dbPath;
  availability = await import("../src/lib/availability");
  booking = await import("../src/lib/booking");
});

afterAll(() => fx?.cleanup());

const base = () => ({
  spaId: fx.spaId,
  branchId: fx.branchId,
  treatmentId: fx.treatmentId,
  date: DATE,
  guests: 1,
  serviceType: "in_spa" as const,
});

describe("computeAvailability", () => {
  it("returns slots inside opening hours only", () => {
    const res = availability.computeAvailability(base());
    expect(res.meta.spaOpen).toBe(true);
    expect(res.slots.length).toBeGreaterThan(0);
    for (const s of res.slots) {
      expect(s.time >= "09:00").toBe(true);
      // 60-min treatment must end by 21:00 => last start 20:00
      expect(s.time <= "20:00").toBe(true);
    }
  });

  it("respects treatment duration against closing time", () => {
    fx.db.prepare("UPDATE treatments SET duration_min = 120 WHERE id = ?").run(fx.treatmentId);
    const res = availability.computeAvailability(base());
    for (const s of res.slots) expect(s.time <= "19:00").toBe(true);
    fx.db.prepare("UPDATE treatments SET duration_min = 60 WHERE id = ?").run(fx.treatmentId);
  });

  it("requires enough therapists for guest count", () => {
    // 4 guests with only 3 qualified therapists => no slots
    const res = availability.computeAvailability({ ...base(), guests: 4 });
    expect(res.slots).toHaveLength(0);
    expect(res.meta.fullyBooked).toBe(true);

    const ok = availability.computeAvailability({ ...base(), guests: 3 });
    expect(ok.slots.length).toBeGreaterThan(0);
  });

  it("excludes non-qualified therapists from candidates", () => {
    const unqualified = fx.db.prepare(
      "INSERT INTO therapists (spa_id, branch_id, name, status) VALUES (?,?, 'Unqualified', 'active')"
    ).run(fx.spaId, fx.branchId);
    const id = Number(unqualified.lastInsertRowid);
    const res = availability.computeAvailability(base());
    expect(res.therapistStatuses.find((t) => t.therapistId === id)).toBeUndefined();
    fx.db.prepare("DELETE FROM therapists WHERE id = ?").run(id);
  });

  it("therapist column shows name + status only (no treatment names)", () => {
    const res = availability.computeAvailability(base());
    expect(res.therapistStatuses.length).toBe(3);
    for (const t of res.therapistStatuses) {
      expect(Object.keys(t).sort()).toEqual(["name", "status", "therapistId"]);
      expect(["Available", "Treatment", "Break", "Off", "Not Available"]).toContain(t.status);
    }
  });

  it("marks day-off therapists as Off", () => {
    fx.db.prepare("INSERT INTO therapist_days_off (therapist_id, off_date, reason) VALUES (?,?, 'Off')")
      .run(fx.therapistIds[0], DATE);
    const res = availability.computeAvailability(base());
    const ayu = res.therapistStatuses.find((t) => t.therapistId === fx.therapistIds[0])!;
    expect(ayu.status).toBe("Off");
    // Only 2 therapists left => 3-guest bookings impossible now
    const forThree = availability.computeAvailability({ ...base(), guests: 3 });
    expect(forThree.slots).toHaveLength(0);
    fx.db.prepare("DELETE FROM therapist_days_off WHERE therapist_id = ?").run(fx.therapistIds[0]);
  });

  it("blocks rooms when all rooms are busy", () => {
    // occupy both rooms for the full day via direct bookings
    const ins = fx.db.prepare(
      `INSERT INTO bookings (ref, customer_id, spa_id, branch_id, treatment_id, therapist_id, room_id,
         booking_date, start_time, duration_min, guests, service_type, customer_name, customer_email,
         therapist_preference, status, subtotal, total, currency)
       VALUES (?,?,?,?,?,?,?,?,?,?,?, 'in_spa', 'X', 'x@test.local', 'any', 'confirmed', 0, 0, 'IDR')`
    );
    const refs: number[] = [];
    for (const [i, room] of fx.roomIds.entries()) {
      const r = ins.run(`BYS-ROOM-${i}-${room}`, fx.userIds.customer, fx.spaId, fx.branchId, fx.treatmentId,
        fx.therapistIds[i], room, DATE, "09:00", 720, 1);
      refs.push(Number(r.lastInsertRowid));
    }
    const res = availability.computeAvailability(base());
    expect(res.slots).toHaveLength(0);
    for (const id of refs) fx.db.prepare("DELETE FROM bookings WHERE id = ?").run(id);
  });

  it("returns no slots when the spa is closed that day", () => {
    const closedDate = "2026-10-13"; // Tuesday, but we close the branch
    fx.db.prepare("UPDATE branches SET opening_hours = ? WHERE id = ?")
      .run(JSON.stringify({ tue: ["closed"] }), fx.branchId);
    const res = availability.computeAvailability({ ...base(), date: closedDate });
    expect(res.meta.spaOpen).toBe(false);
    expect(res.slots).toHaveLength(0);
    fx.db.prepare("UPDATE branches SET opening_hours = ? WHERE id = ?").run(
      JSON.stringify({ mon: ["09:00", "21:00"], tue: ["09:00", "21:00"], wed: ["09:00", "21:00"], thu: ["09:00", "21:00"], fri: ["09:00", "21:00"], sat: ["09:00", "21:00"], sun: ["09:00", "21:00"] }),
      fx.branchId
    );
  });
});

describe("booking creation blocks conflicts", () => {
  it("rejects a second booking when all therapists are occupied", () => {
    // Fill the 10:00 slot with all 3 therapists (3 guests, 3 therapists, 1 room)
    const first = booking.createBooking({
      customerId: fx.userIds.customer,
      spaId: fx.spaId, branchId: fx.branchId, treatmentId: fx.treatmentId,
      therapistPreference: "any", date: DATE, time: "10:00", guests: 3,
      serviceType: "in_spa",
      customer: { name: "Test", email: "t@t.local" },
    });
    expect(first.status).toBe("payment_pending");
    expect(first.therapist_id).toBeTruthy();

    // All 3 therapists busy 10:00–11:00 => another booking at 10:00 must fail
    expect(() =>
      booking.createBooking({
        customerId: fx.userIds.customer,
        spaId: fx.spaId, branchId: fx.branchId, treatmentId: fx.treatmentId,
        therapistPreference: "any", date: DATE, time: "10:00", guests: 1,
        serviceType: "in_spa",
        customer: { name: "Test3", email: "t3@t.local" },
      })
    ).toThrow(/available/i);
  });

  it("rejects overlap at different start time (partial overlap)", () => {
    // therapists busy 10:00-11:00; a 60-min treatment at 10:30 overlaps
    expect(() =>
      booking.createBooking({
        customerId: fx.userIds.customer,
        spaId: fx.spaId, branchId: fx.branchId, treatmentId: fx.treatmentId,
        therapistPreference: "any", date: DATE, time: "10:30", guests: 3,
        serviceType: "in_spa",
        customer: { name: "Overlap", email: "o@t.local" },
      })
    ).toThrow(/available|rooms free/i);
    // (all therapists busy AND room 1 busy at that time)
  });

  it("slotIsFree respects working schedules", () => {
    // Wayan works 09-21; narrow his schedule to 14-21 and pick 10:00 with gender/specific pref
    const w = fx.therapistIds[2];
    fx.db.prepare("DELETE FROM therapist_schedules WHERE therapist_id = ? AND start_time = '09:00'").run(w);
    const check = availability.slotIsFree({ ...base(), time: "10:00", therapistId: w, guests: 1 });
    expect(check.ok).toBe(false);
    fx.db.prepare("INSERT INTO therapist_schedules (therapist_id, weekday, start_time, end_time) VALUES (?,0,'09:00','21:00')").run(w);
  });
});

describe("payment hold expiry", () => {
  it("releases unpaid bookings after hold expiry", () => {
    const b = booking.createBooking({
      customerId: fx.userIds.customer,
      spaId: fx.spaId, branchId: fx.branchId, treatmentId: fx.treatmentId,
      therapistPreference: "any", date: "2026-10-20", time: "12:00", guests: 1,
      serviceType: "in_spa",
      customer: { name: "Hold", email: "h@t.local" },
    });
    // force expiry
    fx.db.prepare("UPDATE bookings SET hold_expires_at = datetime('now', '-1 minute') WHERE id = ?").run(b.id);
    const released = booking.releaseExpiredHolds();
    expect(released).toBeGreaterThanOrEqual(1);
    const after = fx.db.prepare("SELECT status FROM bookings WHERE id = ?").get(b.id) as any;
    expect(after.status).toBe("cancelled");
    // slot must be free again
    const check = availability.slotIsFree({ ...base(), date: "2026-10-20", time: "12:00", guests: 1 });
    expect(check.ok).toBe(true);
  });
});
