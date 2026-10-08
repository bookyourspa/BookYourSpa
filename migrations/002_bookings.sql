-- =============================================================================
-- Book Your Spa — bookings, payments, commissions, settlements, promotions,
-- reviews, notifications, audit
-- =============================================================================
PRAGMA foreign_keys = ON;

-- --- Bookings -----------------------------------------------------------------

CREATE TABLE bookings (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ref            TEXT NOT NULL UNIQUE,          -- e.g. BYS-20261007-XXXX
  customer_id    INTEGER NOT NULL REFERENCES users(id),
  spa_id         INTEGER NOT NULL REFERENCES spas(id),
  branch_id      INTEGER NOT NULL REFERENCES branches(id),
  treatment_id   INTEGER NOT NULL REFERENCES treatments(id),
  therapist_id   INTEGER REFERENCES therapists(id),   -- NULL = any / unassigned
  room_id        INTEGER REFERENCES rooms(id),
  booking_date   TEXT NOT NULL,                 -- YYYY-MM-DD
  start_time     TEXT NOT NULL,                 -- HH:MM (local spa time)
  duration_min   INTEGER NOT NULL,
  guests         INTEGER NOT NULL DEFAULT 1,
  service_type   TEXT NOT NULL DEFAULT 'in_spa'
                 CHECK (service_type IN ('in_spa','doorstep')),
  address        TEXT,                          -- doorstep address
  lat            REAL,
  lng            REAL,
  customer_name  TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  customer_whatsapp TEXT,
  customer_country TEXT,
  special_request TEXT,
  therapist_preference TEXT NOT NULL DEFAULT 'any'
                 CHECK (therapist_preference IN ('any','specific')),
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','payment_pending','confirmed','voucher_issued',
                                   'in_treatment','completed','cancelled','refunded','no_show')),
  hold_expires_at TEXT,                          -- temporary reservation lock
  subtotal       INTEGER NOT NULL DEFAULT 0,
  discount       INTEGER NOT NULL DEFAULT 0,
  travel_fee     INTEGER NOT NULL DEFAULT 0,
  service_fee    INTEGER NOT NULL DEFAULT 0,
  tax            INTEGER NOT NULL DEFAULT 0,
  total          INTEGER NOT NULL DEFAULT 0,
  currency       TEXT NOT NULL DEFAULT 'IDR',
  promo_code     TEXT,
  cancel_policy  TEXT,
  source         TEXT NOT NULL DEFAULT 'web',
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_bookings_customer ON bookings(customer_id);
CREATE INDEX idx_bookings_spa_date ON bookings(spa_id, booking_date);
CREATE INDEX idx_bookings_therapist_date ON bookings(therapist_id, booking_date);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_hold ON bookings(hold_expires_at);
-- Concurrency safety net: one active booking per (therapist, date, start time)
CREATE UNIQUE INDEX idx_bookings_therapist_slot
  ON bookings(therapist_id, booking_date, start_time)
  WHERE therapist_id IS NOT NULL
    AND status IN ('pending','payment_pending','confirmed','voucher_issued','in_treatment');

-- Every status change is recorded
CREATE TABLE booking_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status  TEXT NOT NULL,
  note       TEXT,
  actor_id   INTEGER REFERENCES users(id),
  actor_role TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_bevents_booking ON booking_events(booking_id);

-- Temporarily locks a therapist/room slot while a customer pays
CREATE TABLE booking_holds (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  spa_id      INTEGER NOT NULL REFERENCES spas(id) ON DELETE CASCADE,
  branch_id   INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  therapist_id INTEGER REFERENCES therapists(id) ON DELETE CASCADE,
  room_id     INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
  hold_date   TEXT NOT NULL,
  start_time  TEXT NOT NULL,
  end_time    TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  session_key TEXT NOT NULL,                    -- ties hold to a browser/cart
  released    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_holds_lookup ON booking_holds(therapist_id, hold_date, start_time);
CREATE INDEX idx_holds_expires ON booking_holds(expires_at);

-- --- Payments -------------------------------------------------------------------

CREATE TABLE payments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id     INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  provider       TEXT NOT NULL DEFAULT 'sandbox',
  method         TEXT,                          -- card, qris, bank_transfer, wallet, cash
  amount         INTEGER NOT NULL,
  currency       TEXT NOT NULL DEFAULT 'IDR',
  status         TEXT NOT NULL DEFAULT 'created'
                 CHECK (status IN ('created','pending','paid','failed','refunded','partially_refunded')),
  transaction_id TEXT,
  provider_raw   TEXT,                          -- JSON response (no card data ever)
  paid_at        TEXT,
  refunded_amount INTEGER NOT NULL DEFAULT 0,
  refund_status  TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_payments_booking ON payments(booking_id);
CREATE INDEX idx_payments_status ON payments(status);

CREATE TABLE refunds (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  amount     INTEGER NOT NULL,
  reason     TEXT,
  status     TEXT NOT NULL DEFAULT 'pending'
             CHECK (status IN ('pending','approved','processed','rejected')),
  requested_by INTEGER REFERENCES users(id),
  processed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- --- Commission & settlement -----------------------------------------------------

CREATE TABLE commissions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id   INTEGER NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  supplier_id  INTEGER NOT NULL REFERENCES suppliers(id),
  gross        INTEGER NOT NULL,
  rate         REAL NOT NULL,
  amount       INTEGER NOT NULL,                -- platform commission
  net          INTEGER NOT NULL,                -- supplier share
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','settled','cancelled')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  settled_at   TEXT
);
CREATE INDEX idx_commissions_supplier ON commissions(supplier_id);

CREATE TABLE settlements (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id   INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  period_start  TEXT NOT NULL,
  period_end    TEXT NOT NULL,
  gross         INTEGER NOT NULL,
  commission    INTEGER NOT NULL,
  refunds       INTEGER NOT NULL DEFAULT 0,
  adjustments   INTEGER NOT NULL DEFAULT 0,
  net           INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','processing','paid','on_hold')),
  paid_at       TEXT,
  note          TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_settlements_supplier ON settlements(supplier_id);

-- --- Promotions -------------------------------------------------------------------

CREATE TABLE promotions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  description   TEXT,
  kind          TEXT NOT NULL CHECK (kind IN ('percent','fixed')),
  value         INTEGER NOT NULL,               -- percent (10) or fixed amount
  currency      TEXT NOT NULL DEFAULT 'IDR',
  min_value     INTEGER NOT NULL DEFAULT 0,
  scope         TEXT NOT NULL DEFAULT 'platform'
                CHECK (scope IN ('platform','spa','treatment','destination','first_booking')),
  spa_id        INTEGER REFERENCES spas(id) ON DELETE CASCADE,
  treatment_id  INTEGER REFERENCES treatments(id) ON DELETE CASCADE,
  destination   TEXT,
  starts_at     TEXT NOT NULL,
  ends_at       TEXT NOT NULL,
  max_uses      INTEGER,
  used_count    INTEGER NOT NULL DEFAULT 0,
  active        INTEGER NOT NULL DEFAULT 1,
  created_by    INTEGER REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_promotions_active ON promotions(active, starts_at, ends_at);

-- --- Reviews -----------------------------------------------------------------------

CREATE TABLE reviews (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id  INTEGER NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES users(id),
  spa_id      INTEGER NOT NULL REFERENCES spas(id) ON DELETE CASCADE,
  treatment_id INTEGER REFERENCES treatments(id) ON DELETE SET NULL,
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body        TEXT,
  photos      TEXT DEFAULT '[]',
  reply       TEXT,
  replied_at  TEXT,
  status      TEXT NOT NULL DEFAULT 'published'
              CHECK (status IN ('published','hidden','pending')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_reviews_spa ON reviews(spa_id);

-- --- Notifications -------------------------------------------------------------------

CREATE TABLE notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,                     -- booking_received, payment_received, ...
  title      TEXT NOT NULL,
  body       TEXT,
  link       TEXT,
  read_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_notifications_user ON notifications(user_id, read_at);

-- Outbound email / WhatsApp messages (sent or queued)
CREATE TABLE outbound_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  channel    TEXT NOT NULL CHECK (channel IN ('email','whatsapp')),
  template   TEXT NOT NULL,
  to_address TEXT NOT NULL,
  subject    TEXT,
  payload    TEXT,                               -- JSON body
  status     TEXT NOT NULL DEFAULT 'logged'
             CHECK (status IN ('logged','queued','sent','failed')),
  error      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_outbound_channel ON outbound_messages(channel, created_at);

-- --- Audit log ----------------------------------------------------------------------

CREATE TABLE audit_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id),
  actor_role TEXT,
  action     TEXT NOT NULL,                     -- supplier.approve, booking.cancel, ...
  entity     TEXT,
  entity_id  TEXT,
  before     TEXT,
  after      TEXT,
  ip         TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_audit_entity ON audit_logs(entity, entity_id);
CREATE INDEX idx_audit_user ON audit_logs(user_id);

-- --- Platform settings ----------------------------------------------------------------

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
