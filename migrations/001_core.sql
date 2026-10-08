-- =============================================================================
-- Book Your Spa — core schema: users, roles, suppliers, spas, branches,
-- therapists, treatments, rooms, schedules
-- =============================================================================
PRAGMA foreign_keys = ON;

-- --- Users & auth ------------------------------------------------------------

CREATE TABLE users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  email          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'customer'
                 CHECK (role IN ('customer','supplier','admin')),
  admin_level    TEXT CHECK (admin_level IN ('super','operations','finance','content','support')),
  full_name      TEXT NOT NULL,
  phone          TEXT,
  whatsapp       TEXT,
  country        TEXT,
  avatar_url     TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','suspended','deleted')),
  failed_logins  INTEGER NOT NULL DEFAULT 0,
  locked_until   TEXT,
  last_login_at  TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE auth_sessions (
  id           TEXT PRIMARY KEY,              -- random token (also the cookie value hash key)
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at   TEXT NOT NULL,
  ip           TEXT,
  user_agent   TEXT,
  revoked      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_sessions_user ON auth_sessions(user_id);
CREATE INDEX idx_sessions_expires ON auth_sessions(expires_at);

CREATE TABLE password_resets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- --- Suppliers (spa businesses) ----------------------------------------------

CREATE TABLE suppliers (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  business_name     TEXT NOT NULL,
  description       TEXT,
  logo_url          TEXT,
  cover_url         TEXT,
  website           TEXT,
  whatsapp          TEXT,
  social            TEXT,                        -- JSON object
  country           TEXT NOT NULL DEFAULT 'Indonesia',
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','changes_requested','suspended','unpublished')),
  status_reason     TEXT,
  commission_rate   REAL,                        -- NULL => platform default
  payout_method     TEXT,
  payout_details    TEXT,                        -- JSON
  submitted_at      TEXT,
  reviewed_at       TEXT,
  reviewed_by       INTEGER REFERENCES users(id),
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_suppliers_status ON suppliers(status);

CREATE TABLE spa_categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT
);

-- --- Locations: Country → Region → City → Area -------------------------------

CREATE TABLE locations (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER REFERENCES locations(id),
  slug      TEXT NOT NULL UNIQUE,
  name      TEXT NOT NULL,
  kind      TEXT NOT NULL CHECK (kind IN ('country','region','city','area')),
  lat       REAL,
  lng       REAL
);
CREATE INDEX idx_locations_parent ON locations(parent_id);

-- --- Spas & branches ---------------------------------------------------------

CREATE TABLE spas (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id    INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  slug           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  description    TEXT,
  logo_url       TEXT,
  cover_url      TEXT,
  gallery        TEXT DEFAULT '[]',             -- JSON array of image URLs
  location_id    INTEGER REFERENCES locations(id),
  address        TEXT,
  lat            REAL,
  lng            REAL,
  city           TEXT,
  country        TEXT NOT NULL DEFAULT 'Indonesia',
  phone          TEXT,
  email          TEXT,
  whatsapp       TEXT,
  website        TEXT,
  opening_hours  TEXT,                           -- JSON: {"mon":["09:00","21:00"], ...}
  facilities     TEXT DEFAULT '[]',              -- JSON array
  languages      TEXT DEFAULT '[]',              -- JSON array
  spa_types      TEXT DEFAULT '[]',              -- JSON: day_spa, hotel_spa, mobile...
  policies       TEXT,                           -- JSON text
  cancel_hours   INTEGER NOT NULL DEFAULT 24,    -- free cancellation window (hours before)
  rating_avg     REAL NOT NULL DEFAULT 0,
  rating_count   INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','pending','published','unpublished','suspended')),
  is_featured    INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_spas_supplier ON spas(supplier_id);
CREATE INDEX idx_spas_status ON spas(status);
CREATE INDEX idx_spas_location ON spas(location_id);

CREATE TABLE branches (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  spa_id       INTEGER NOT NULL REFERENCES spas(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  address      TEXT,
  lat          REAL,
  lng          REAL,
  city         TEXT,
  phone        TEXT,
  opening_hours TEXT,                            -- JSON, falls back to spa hours
  facilities   TEXT DEFAULT '[]',
  capacity     INTEGER NOT NULL DEFAULT 4,       -- simultaneous treatments
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_branches_spa ON branches(spa_id);

CREATE TABLE rooms (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id  INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  capacity   INTEGER NOT NULL DEFAULT 2,
  resources  TEXT DEFAULT '[]',                 -- e.g. ["jacuzzi","steam"]
  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive'))
);
CREATE INDEX idx_rooms_branch ON rooms(branch_id);

-- --- Therapists ---------------------------------------------------------------

CREATE TABLE therapists (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  spa_id      INTEGER NOT NULL REFERENCES spas(id) ON DELETE CASCADE,
  branch_id   INTEGER REFERENCES branches(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  photo_url   TEXT,
  gender      TEXT CHECK (gender IN ('female','male','other')),
  specialty   TEXT,
  skills      TEXT DEFAULT '[]',
  languages   TEXT DEFAULT '[]',
  qualifications TEXT DEFAULT '[]',
  status      TEXT NOT NULL DEFAULT 'active'
              CHECK (status IN ('active','inactive','on_leave')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_therapists_spa ON therapists(spa_id);
CREATE INDEX idx_therapists_branch ON therapists(branch_id);

-- Weekly working schedule: 0=Sunday..6=Saturday
CREATE TABLE therapist_schedules (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  therapist_id INTEGER NOT NULL REFERENCES therapists(id) ON DELETE CASCADE,
  weekday      INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time   TEXT NOT NULL,                   -- 'HH:MM'
  end_time     TEXT NOT NULL,
  UNIQUE (therapist_id, weekday, start_time)
);
CREATE INDEX idx_tsched_therapist ON therapist_schedules(therapist_id);

-- Specific days off (holidays, vacation)
CREATE TABLE therapist_days_off (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  therapist_id INTEGER NOT NULL REFERENCES therapists(id) ON DELETE CASCADE,
  off_date     TEXT NOT NULL,                   -- YYYY-MM-DD
  reason       TEXT,
  UNIQUE (therapist_id, off_date)
);

-- Therapist ↔ treatment qualifications
CREATE TABLE therapist_treatments (
  therapist_id INTEGER NOT NULL REFERENCES therapists(id) ON DELETE CASCADE,
  treatment_id INTEGER NOT NULL,
  PRIMARY KEY (therapist_id, treatment_id)
);

-- --- Treatments ----------------------------------------------------------------

CREATE TABLE treatment_categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  sort        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE treatments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  spa_id         INTEGER NOT NULL REFERENCES spas(id) ON DELETE CASCADE,
  category_id    INTEGER REFERENCES treatment_categories(id),
  slug           TEXT NOT NULL,
  name           TEXT NOT NULL,
  description    TEXT,
  benefits       TEXT,                          -- JSON array
  duration_min   INTEGER NOT NULL,
  price          INTEGER NOT NULL,              -- minor-unit-free integer in currency
  discount       INTEGER NOT NULL DEFAULT 0,    -- percentage
  currency       TEXT NOT NULL DEFAULT 'IDR',
  images         TEXT DEFAULT '[]',
  min_guests     INTEGER NOT NULL DEFAULT 1,
  max_guests     INTEGER NOT NULL DEFAULT 4,
  room_required  INTEGER NOT NULL DEFAULT 1,    -- needs 1 treatment room
  buffer_min     INTEGER NOT NULL DEFAULT 0,    -- gap after treatment
  therapist_gender TEXT CHECK (therapist_gender IN ('female','male','no_pref')),
  home_service   INTEGER NOT NULL DEFAULT 0,    -- can be done doorstep
  travel_fee     INTEGER NOT NULL DEFAULT 0,
  service_radius_km REAL,
  status         TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','hidden','deleted')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (spa_id, slug)
);
CREATE INDEX idx_treatments_spa ON treatments(spa_id);
CREATE INDEX idx_treatments_category ON treatments(category_id);

-- Which branches offer which treatments
CREATE TABLE treatment_branches (
  treatment_id INTEGER NOT NULL REFERENCES treatments(id) ON DELETE CASCADE,
  branch_id    INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  PRIMARY KEY (treatment_id, branch_id)
);
