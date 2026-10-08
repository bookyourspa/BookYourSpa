/**
 * Double-booking protection under concurrency.
 *
 * Simulates two customers reaching payment for the same slot at the same
 * moment. One must win; the other must receive 409-style rejection.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeFixture, Fixture } from "./helpers";

let fx: Fixture;
let booking: typeof import("../src/lib/booking");
let availability: typeof import("../src/lib/availability");

const DATE = "2026-11-05";

beforeAll(async () => {
  fx = makeFixture();
  process.env.DATABASE_PATH = fx.dbPath;
  booking = await import("../src/lib/booking");
  availability = await import("../src/lib/availability");
});

afterAll(() => fx?.cleanup());

describe("simultaneous bookings", () => {
  it("only one of N concurrent identical bookings succeeds", async () => {
    // 3 therapists, but book with guests=3 so every attempt needs ALL therapists
    // for the same 10:00 slot — exactly one can win.
    const attempts = Array.from({ length: 6 }, (_, i) =>
      Promise.resolve()
        .then(() =>
          booking.createBooking({
            customerId: fx.userIds.customer,
            spaId: fx.spaId, branchId: fx.branchId, treatmentId: fx.treatmentId,
            therapistPreference: "any", date: DATE, time: "10:00", guests: 3,
            serviceType: "in_spa",
            customer: { name: `Racer ${i}`, email: `racer${i}@t.local` },
          })
        )
        .then((b) => ({ ok: true as const, ref: b.ref }))
        .catch((e) => ({ ok: false as const, error: String(e?.message || e) }))
    );

    const results = await Promise.all(attempts);
    const winners = results.filter((r) => r.ok);
    const losers = results.filter((r) => !r.ok);

    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(5);
    for (const l of losers) expect(l.error).toMatch(/available|conflict|UNIQUE/i);

    // DB truth: exactly one active booking at that slot
    const rows = fx.db
      .prepare(
        `SELECT COUNT(*) c FROM bookings WHERE booking_date = ? AND start_time = ?
           AND status IN ('pending','payment_pending','confirmed')`
      )
      .get(DATE, "10:00") as any;
    expect(rows.c).toBe(1);
  });

  it("unique index backstop rejects duplicate therapist slots", () => {
    // Directly attempt SQL-level duplicate for the assigned therapist
    const existing = fx.db
      .prepare(
        `SELECT therapist_id, booking_date, start_time FROM bookings
          WHERE booking_date = ? AND start_time = '10:00' AND therapist_id IS NOT NULL
            AND status IN ('payment_pending','confirmed') LIMIT 1`
      )
      .get(DATE) as any;
    expect(existing).toBeTruthy();

    expect(() =>
      fx.db
        .prepare(
          `INSERT INTO bookings (ref, customer_id, spa_id, branch_id, treatment_id, therapist_id,
             booking_date, start_time, duration_min, guests, service_type, customer_name, customer_email,
             therapist_preference, status, subtotal, total, currency)
           VALUES ('BYS-DUP-1', ?, ?, ?, ?, ?, ?, '10:00', 60, 1, 'in_spa', 'Dup', 'dup@t.local',
             'any', 'confirmed', 0, 0, 'IDR')`
        )
        .run(
          fx.userIds.customer, fx.spaId, fx.branchId, fx.treatmentId,
          existing.therapist_id, DATE
        )
    ).toThrow(/UNIQUE/i);
  });
});
