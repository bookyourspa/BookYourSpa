# Book Your Spa

**Global spa & wellness marketplace** — customers discover spas, see *real* live availability and book online; suppliers run their operations through a dashboard; admins approve suppliers, manage bookings, commissions, settlements and audits.

Real working platform: SQLite database, session auth with role-based permissions, a transactional availability/booking engine with double-booking protection, modular payments, notifications, reviews, promotions and SEO-friendly public pages.

## Stack

| Layer      | Technology |
| ---------- | ---------- |
| Framework  | Next.js 16 (App Router, Turbopack), React 19 |
| Language   | TypeScript (strict) |
| Database   | SQLite via `better-sqlite3` (WAL, foreign keys) — file at `DATABASE_PATH` |
| Styling    | Tailwind CSS 4 |
| Validation | Zod |
| Tests      | Vitest |

## Quick start

```bash
npm install
cp .env.example .env          # then edit values (SESSION_SECRET at minimum)
npm run db:migrate            # apply migrations/NNN_*.sql
npm run db:seed               # OPTIONAL — demo/test data (clearly labelled)
npm run dev                   # http://localhost:3000
```

Run the checks:

```bash
npm run typecheck             # tsc --noEmit
npm test                      # vitest run (auth, availability, concurrency)
npm run build                 # production build
npm run lint                  # eslint
```

### Demo accounts (created by `npm run db:seed`)

Password for all: `Demo123!`

| Role     | Email               |
| -------- | ------------------- |
| Customer | customer@demo.test  |
| Supplier | supplier@demo.test  |
| Admin    | admin@demo.test (super) |
| Therapist| therapist@demo.test |

The login page has one-click fill buttons for these accounts.

## Environment configuration

Copy `.env.example` → `.env`. All variables are documented inline in `.env.example`. Highlights:

| Variable | Purpose |
| -------- | ------- |
| `DATABASE_PATH` | SQLite file. Staging and production MUST use separate files. |
| `SESSION_SECRET` | Signs session cookies. 32+ random bytes (`openssl rand -hex 32`). |
| `SESSION_TTL_HOURS` | Session lifetime (default 168). |
| `BOOKING_HOLD_MINUTES` | Payment hold window before a slot auto-releases (default 10). |
| `PAYMENT_PROVIDER` | `sandbox` (offline, deterministic) or a future registered gateway. |
| `DEFAULT_COMMISSION_RATE` | Platform commission % (admin settings can override). |
| `EMAIL_TRANSPORT` | `log` (writes to DB outbox) or `smtp` (real mail). |

**Never commit `.env`** — it is git-ignored. Production secrets belong in the hosting platform's secret manager, not in the repository.

## Architecture

```
migrations/           SQL migrations, applied in order, recorded in schema_migrations
scripts/
  migrate.ts          applies pending migrations (npm run db:migrate)
  seed.ts             demo/test data (npm run db:seed)
src/lib/
  db.ts               connection, migration runner, transactions (tx)
  auth.ts             scrypt password hashing, sessions, roles
  api.ts              route handler wrapper: auth, rate-limit, zod parsing, errors
  availability.ts     availability engine + slotIsFree (authoritative check)
  booking.ts          createBooking, holds, status flow, price quote
  payments.ts         PaymentProvider interface, sandbox gateway, commission, refunds
  notify.ts           in-platform notifications + email/WhatsApp outbox templates
src/app/api/          REST endpoints (see docs/API.md)
src/app/              public pages, dashboards, error pages, sitemap/robots
tests/                vitest suites
```

### Roles & permissions

- **customer** — search, book, pay, cancel, review, profile
- **supplier** — manage own spa(s): treatments, therapists, schedules, bookings, stats
- **admin** (`super` / `finance` / `operations` / `content` / `support`) — platform-wide

Authorization is enforced in `src/lib/api.ts` route options; every supplier/admin query is scoped by the session's user id / spa id — clients can never address another tenant's rows by id.

### Booking engine guarantees

1. **Availability** (`src/lib/availability.ts`) considers opening hours, therapist schedules & days off, qualification for the treatment, gender preference, buffers, rooms, and *all* active bookings **plus `booking_assignments`** (multi-guest parties occupy one therapist per guest).
2. **Authoritative re-check** — `slotIsFree()` runs *inside* the booking write transaction.
3. **DB-level backstop** — partial unique index on `booking_assignments(therapist_id, booking_date, start_time)` for active statuses makes a double booking impossible even under races.
4. **Holds** — reaching payment creates a `BOOKING_HOLD_MINUTES` reservation; expired holds release the slot automatically (opportunistic cleanup on availability/booking requests, no cron needed).

This is covered by `tests/concurrency.test.ts` (N simultaneous bookings → exactly one wins) and `tests/availability.test.ts`.

### Payment & money flow

`PaymentProvider` interface → `sandbox` provider by default (never touches real money). A successful capture confirms the booking, writes the commission row (supplier-specific rate → admin setting → `DEFAULT_COMMISSION_RATE`), and sends confirmations. Admin refunds reverse the commission proportionally and move the booking to `refunded`. Settlements pay out a supplier's pending commissions and are audit-logged. Raw card data is never accepted or stored.

## API documentation

See **[docs/API.md](docs/API.md)** for every endpoint, auth requirements and payloads. Conventions: success responses are `{ ok: true, data: ... }`, errors are `{ ok: false, error, details? }` with an appropriate HTTP status (401 unauthenticated, 403 forbidden role, 404 missing, 409 conflict/state, 429 rate-limited).

## Testing

```bash
npm test                 # all suites
npx vitest run tests/concurrency.test.ts
npm run test:watch
```

- `tests/auth.test.ts` — registration, login, session, role guards
- `tests/availability.test.ts` — hours, schedules, buffers, rooms, multi-guest, holds
- `tests/concurrency.test.ts` — simultaneous bookings: one winner, UNIQUE-index backstop

Each suite builds an isolated temp database from `tests/helpers.ts` — no shared state, safe to run repeatedly.

## Deployment

Development flow: `feature branch → PR → staging → QA → main → production`.

```bash
# staging (separate DB!)
DATABASE_PATH=./data/staging.db npm run db:migrate
npm run typecheck && npm test && npm run build
npm start                                # next start (PORT)

# production
npm ci
npm run db:migrate                       # run BEFORE switching traffic
npm run build && npm start
```

**Rollback:** redeploy the previous git revision, and if a migration was included, restore the pre-migration DB backup first (migrations are forward-only by design — see below).

Git hygiene (enforced by `.gitignore`): `.env`, `*.db*`, `/data` are never committed. Only `.env.example` is tracked.

### Backup & restore

The entire database is one SQLite file (`DATABASE_PATH`).

```bash
# backup (safe while running — uses the online backup API)
node -e "require('better-sqlite3')('data/bookyourspa.db').backup('data/backup-$(date +%F).db').then(()=>console.log('done'))"

# restore
# 1. stop the app  2. replace DATABASE_PATH with the backup file  3. start the app
```

Recommended: schedule the backup command daily, retain ≥ 7 days, and **test a restore** after any schema change.

## Security

- scrypt password hashing; sessions in HttpOnly cookies signed with `SESSION_SECRET`
- Zod input validation on every route; parameterized SQL everywhere (no string-concatenated user input)
- Rate limiting on auth, booking and review endpoints
- Security headers in `next.config.ts` (X-Frame-Options, nosniff, referrer policy, HSTS on HTTPS)
- Audit log for admin/supplier sensitive actions (`/api/admin/audit`)
- Payment secrets via environment only; no raw card data stored
