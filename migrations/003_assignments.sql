-- =============================================================================
-- Booking assignments: a multi-guest booking occupies several therapists
-- (and rooms). Availability must see ALL of them, not just the lead therapist.
-- booking_date/start_time are denormalized so a DB-level unique index can
-- reject two active assignments for the same therapist+slot.
-- =============================================================================
PRAGMA foreign_keys = ON;

CREATE TABLE booking_assignments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id   INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  therapist_id INTEGER NOT NULL REFERENCES therapists(id),
  room_id      INTEGER REFERENCES rooms(id),
  booking_date TEXT NOT NULL,
  start_time   TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'payment_pending',
  guest_index  INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (booking_id, therapist_id)
);
CREATE INDEX idx_assignments_therapist ON booking_assignments(therapist_id, booking_date);

-- DB-level double-booking guard: one ACTIVE assignment per therapist+slot.
CREATE UNIQUE INDEX idx_assignments_slot
  ON booking_assignments(therapist_id, booking_date, start_time)
  WHERE status IN ('pending','payment_pending','confirmed','voucher_issued','in_treatment');
