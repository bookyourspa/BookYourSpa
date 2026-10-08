# API Documentation

Base URL: same origin as the app (e.g. `http://localhost:3000`). All endpoints are under `/api`.

## Conventions

**Success:** `{ "ok": true, "data": ... }` (HTTP 200/201)

**Error:** `{ "ok": false, "error": "Human-readable message", "details"? }`

| Status | Meaning |
| ------ | ------- |
| 400 | Validation failed / invalid state for the request |
| 401 | Not authenticated (missing/expired session) |
| 403 | Authenticated but role/ownership not allowed |
| 404 | Resource not found (or not visible to you) |
| 409 | Conflict — e.g. slot taken, illegal status transition, duplicate |
| 410 | Payment hold expired |
| 429 | Rate limited |

**Authentication** uses a session cookie set by `POST /api/auth/login` (HttpOnly). There are no bearer tokens.

**Auth levels** used in the table below:

- `public` — no session required
- `customer` — any logged-in customer, rows scoped to the caller
- `supplier` — supplier account, scoped to their own spa(s)
- `admin:<level>` — admin account with at least that permission level (`super` satisfies all)

---

## Auth & account

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| POST | `/api/auth/register` | public | Create customer account. Body: `{ email, password (≥8), fullName, phone?, whatsapp?, country? }` |
| POST | `/api/auth/login` | public | Body: `{ email, password }`. Sets session cookie, returns user + role |
| POST | `/api/auth/logout` | public | Revokes current session |
| GET | `/api/auth/me` | public | Current user or `null` |
| POST | `/api/auth/forgot-password` | public | Body: `{ email }`. Always `{ sent: true }`; emails reset link if user exists |
| PATCH | `/api/auth/forgot-password` | public | Body: `{ token, password }`. Consumes reset token, revokes sessions |
| PATCH | `/api/account` | customer | Update own profile: `{ fullName?, phone?, whatsapp?, country? }` |
| GET | `/api/notifications` | customer | List own notifications |
| POST | `/api/notifications` | customer | Mark notifications read |

## Marketplace (public)

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| GET | `/api/spas` | public | Search. Query: `q, location, category, spaType, serviceType, minPrice, maxPrice, minRating, duration, sort (recommended\|rating\|price_asc\|price_desc\|popular\|newest), page, limit` |
| GET | `/api/spas/[slug]` | public | Full spa detail: branches, treatments, therapists, reviews |
| GET | `/api/availability` | public | Live slots. Query: `spaId, branchId, treatmentId, date (YYYY-MM-DD), guests, serviceType, therapistId?` → `{ slots: [{ time, therapistIds, roomsFree }] }` |
| GET | `/api/reviews?spaId=N` | public | Published reviews for a spa |
| POST | `/api/promo/validate` | public | Body: `{ code, spaId, treatmentId, subtotal }` → discount preview or error |

## Booking (customer)

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| POST | `/api/bookings` | customer | Create booking (payment_pending + hold). Body: `{ spaId, branchId, treatmentId, therapistPreference: "any"\|"specific", therapistId?, date, time, guests, serviceType: "in_spa"\|"doorstep", address?, promoCode?, customer: { name, email, phone?, whatsapp?, country?, specialRequest? } }` |
| GET | `/api/bookings` | customer | Own bookings |
| GET | `/api/bookings/[ref]` | customer | Detail + events + payment + review |
| POST | `/api/bookings/[ref]` | customer | Cancel own booking. Body: `{ reason? }`. 409 outside free-cancel window |
| POST | `/api/bookings/[ref]/pay` | customer | Capture payment & confirm. Body: `{ method: "card"\|"qris"\|"bank_transfer"\|"wallet"\|"cash", paymentToken? }`. 410 if hold expired |
| POST | `/api/reviews` | customer | Body: `{ bookingRef, rating 1–5, body?, photos? }`. Only on own **completed** booking, once |

## Supplier

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| POST | `/api/supplier/register` | public | Apply as supplier: `{ businessName, email, password, fullName, description?, phone? }` → pending review |
| GET | `/api/supplier/spa` | supplier | Own spa profile |
| POST | `/api/supplier/spa` | supplier | Create/update own spa. `{ ..., action: "draft"\|"submit" }` — `submit` sends it to admin review |
| GET/POST/DELETE | `/api/supplier/treatments` | supplier | List / create-update / delete own treatments |
| GET/POST/DELETE | `/api/supplier/therapists` | supplier | List / create-update (incl. schedule, daysOff, qualifications) / delete |
| GET | `/api/supplier/bookings` | supplier | Own spa's bookings. Query: `date, status, from, to` (max 500) |
| POST | `/api/supplier/bookings` | supplier | `{ action: "confirm"\|"start"\|"complete"\|"cancel"\|"no_show"\|"reschedule"\|"assign", bookingRef, date?, time?, therapistId?, note? }`. Reschedule re-checks availability under a write lock; assign rejects clashes with 409 |
| GET | `/api/supplier/stats` | supplier | Dashboard KPIs, finance (gross/commission/net/pending payout), therapist/room utilization |

## Admin

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| GET | `/api/admin/stats` | admin | Platform KPIs: customers, suppliers, bookings, revenue, commission, refunds, top spas/treatments |
| GET | `/api/admin/suppliers` | admin | Supplier list, filter `?status=` |
| POST | `/api/admin/suppliers` | admin | `{ supplierId, action: "approve"\|"reject"\|"request_changes"\|"suspend"\|"reactivate"\|"unpublish", reason? }` |
| GET | `/api/admin/bookings` | admin | Platform bookings. Query: `status, q` (ref/name/email search) |
| POST | `/api/admin/bookings` | admin (finance) | `{ bookingRef, action: "confirm"\|"cancel"\|"complete"\|"no_show"\|"refund"\|"pending", amount?, reason? }`. Refund reverses commission + audit-logs |
| GET | `/api/admin/settlements` | admin (finance) | Per-supplier gross/commission/net + pending payout + payout history |
| POST | `/api/admin/settlements` | admin (finance) | `{ supplierId, note? }` — pay out all pending commissions, audit-logged |
| GET | `/api/admin/audit` | admin | Audit log. Query: `limit (≤200), entity` |

---

## Booking status flow

```
pending ─→ payment_pending ─→ confirmed ─→ voucher_issued ─→ in_treatment ─→ completed ─→ refunded
                │                │              │                 │              │
                └──────────────→ cancelled ─────────────────────────────────────┘──→ refunded
                                                         confirmed/voucher_issued/in_treatment ─→ refunded
```

Any transition not in this graph returns **409**. Every transition is written to `booking_events`, mirrored to `booking_assignments`, and key admin/supplier actions are written to `audit_logs`.

## Double-booking guarantee

`POST /api/bookings` re-validates the slot inside the transaction (`slotIsFree`) and the DB backstops with a partial unique index on `booking_assignments(therapist_id, booking_date, start_time)` for active statuses. Simultaneous bookings for a fully-occupied slot: exactly one succeeds, the rest get **409**.

## Rate limits

Auth (`login`, `register`, `forgot`, `reset`), `booking`, `pay`, `availability`, `search`, `promo` and `review` are rate-limited per IP/session; exceeding returns **429**.
