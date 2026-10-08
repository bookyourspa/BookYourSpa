/**
 * Seeds the database with clearly-labelled DEMO/TEST data:
 *   - demo accounts (customer / supplier / therapist / admin)
 *   - Bali locations, spa categories, treatment categories
 *   - 4 published spas + 1 pending spa awaiting approval
 *   - treatments, rooms, therapists, weekly schedules, qualifications
 *   - sample bookings, reviews, promotions, platform settings
 *
 * Usage: npm run db:seed
 */
import { getDb } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth";

const db = getDb();
const now = new Date().toISOString();

function upsertUser(email: string, name: string, role: string, extra: any = {}) {
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email) as any;
  if (existing) return existing.id;
  return Number(
    db
      .prepare(
        `INSERT INTO users (email, password_hash, role, admin_level, full_name, phone, whatsapp, country, email_verified)
         VALUES (?,?,?,?,?,?,?,?,1)`
      )
      .run(email, hashPassword(extra.password || "Demo123!"), role, extra.admin_level ?? null,
        name, extra.phone ?? "+62 812 0000 000", extra.whatsapp ?? "+62 812 0000 000", extra.country ?? "Indonesia")
      .lastInsertRowid
  );
}

console.log("[seed] demo accounts (password: Demo123!)");
const customerId = upsertUser("customer@demo.test", "Demo Customer", "customer");
const supplierUserId = upsertUser("supplier@demo.test", "Demo Spa Owner", "supplier");
const adminId = upsertUser("admin@demo.test", "Demo Admin", "admin", { admin_level: "super" });
const therapistUserId = upsertUser("therapist@demo.test", "Demo Therapist", "customer");

// --- Settings ----------------------------------------------------------------
const settings: Record<string, string> = {
  commission_rate: process.env.DEFAULT_COMMISSION_RATE || "10",
  tax_rate: "0",
  service_fee_rate: "0",
  site_name: "Book Your Spa",
};
for (const [k, v] of Object.entries(settings)) {
  db.prepare("INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(k, v);
}

// --- Locations (Country → Region → City → Area) ------------------------------
const loc = (slug: string, name: string, kind: string, parent: number | null, lat?: number, lng?: number) => {
  const has = db.prepare("SELECT id FROM locations WHERE slug = ?").get(slug) as any;
  if (has) return has.id;
  return Number(db.prepare("INSERT INTO locations (slug, name, kind, parent_id, lat, lng) VALUES (?,?,?,?,?,?)")
    .run(slug, name, kind, parent, lat ?? null, lng ?? null).lastInsertRowid);
};
const indonesia = loc("indonesia", "Indonesia", "country", null, -8.3, 115.2);
const bali = loc("bali", "Bali", "region", indonesia, -8.4, 115.2);
const areas: Record<string, number> = {};
for (const [slug, name] of [["seminyak", "Seminyak"], ["ubud", "Ubud"], ["canggu", "Canggu"], ["nusa-dua", "Nusa Dua"], ["sanur", "Sanur"], ["jimbaran", "Jimbaran"]] as const) {
  const found = db.prepare("SELECT id FROM locations WHERE slug = ?").get(slug) as any;
  areas[slug] = found ? found.id : Number(db.prepare("INSERT INTO locations (parent_id, slug, name, kind) VALUES (?,?,?, 'area')").run(bali, slug, name).lastInsertRowid);
}

// --- Categories ----------------------------------------------------------------
const tcats: Record<string, number> = {};
const treatmentCategoryList = [
  ["massage", "Massage"], ["body-treatment", "Body Treatment"], ["facial", "Facial"],
  ["couples", "Couples"], ["wellness", "Wellness & Beauty"], ["ritual", "Traditional Ritual"],
] as const;
for (const [i, [slug, name]] of treatmentCategoryList.entries()) {
  const f = db.prepare("SELECT id FROM treatment_categories WHERE slug = ?").get(slug) as any;
  tcats[slug] = f ? f.id : Number(db.prepare("INSERT INTO treatment_categories (slug, name, sort) VALUES (?,?,?)").run(slug, name, i).lastInsertRowid);
}
for (const [slug, name] of [["day-spa", "Day Spa"], ["hotel-spa", "Hotel Spa"], ["mobile", "Mobile / Doorstep"], ["wellness-center", "Wellness Center"]] as const) {
  if (!db.prepare("SELECT id FROM spa_categories WHERE slug = ?").get(slug)) {
    db.prepare("INSERT INTO spa_categories (slug, name) VALUES (?,?)").run(slug, name);
  }
}

// --- Supplier + Spas ------------------------------------------------------------
let supplierId = (db.prepare("SELECT id FROM suppliers WHERE user_id = ?").get(supplierUserId) as any)?.id;
if (!supplierId) {
  supplierId = Number(
    db.prepare(
      `INSERT INTO suppliers (user_id, business_name, description, status, submitted_at, reviewed_at, reviewed_by)
       VALUES (?,?,?,?,?,?,?)`
    ).run(supplierUserId, "Serenity Wellness Group",
      "DEMO supplier — luxury wellness properties across Bali.", "approved", now, now, adminId).lastInsertRowid
  );
}

interface SpaSeed {
  slug: string; name: string; area: string; city: string; lat: number; lng: number;
  desc: string; types: string[]; featured?: boolean; status?: string;
  treatments: { slug: string; name: string; cat: string; dur: number; price: number; discount?: number; guests: [number, number]; home?: boolean; travel?: number; gender?: string; buffer?: number }[];
}

const HOT_HOURS = JSON.stringify({ mon: ["09:00", "21:00"], tue: ["09:00", "21:00"], wed: ["09:00", "21:00"], thu: ["09:00", "21:00"], fri: ["09:00", "22:00"], sat: ["09:00", "22:00"], sun: ["10:00", "20:00"] });

const spas: SpaSeed[] = [
  {
    slug: "aurora-spa-seminyak", name: "Aurora Spa Seminyak", area: "seminyak", city: "Seminyak",
    lat: -8.6905, lng: 115.1682,
    desc: "A tranquil beachfront sanctuary in the heart of Seminyak. DEOM listing — signature Balinese rituals, aromatic massages and couple treatments in private garden pavilions.",
    types: ["day-spa", "wellness-center"], featured: true,
    treatments: [
      { slug: "balinese-massage", name: "Balinese Massage", cat: "massage", dur: 60, price: 350000, guests: [1, 4], gender: "no_pref" },
      { slug: "aromatherapy-massage", name: "Aromatherapy Massage", cat: "massage", dur: 90, price: 550000, guests: [1, 3] },
      { slug: "couples-massage", name: "Couples Massage", cat: "couples", dur: 60, price: 800000, guests: [2, 2], buffer: 15 },
      { slug: "four-hand-massage", name: "Four Hand Massage", cat: "massage", dur: 60, price: 750000, guests: [1, 1] },
      { slug: "deep-tissue-massage", name: "Deep Tissue Massage", cat: "massage", dur: 60, price: 420000, guests: [1, 2] },
      { slug: "airport-transit-massage", name: "Airport Transit Massage", cat: "massage", dur: 45, price: 300000, guests: [1, 2], home: true, travel: 100000 },
    ],
  },
  {
    slug: "ubud-jungle-wellness", name: "Ubud Jungle Wellness", area: "ubud", city: "Ubud",
    lat: -8.5069, lng: 115.2625,
    desc: "DEMO listing — jungle-view wellness retreat above the Ayung river. Traditional Balinese healing, herbal body wraps and meditation sessions.",
    types: ["day-spa", "wellness-center"],
    treatments: [
      { slug: "balinese-massage", name: "Balinese Massage", cat: "massage", dur: 60, price: 300000, guests: [1, 3] },
      { slug: "traditional-boreh-ritual", name: "Traditional Boreh Ritual", cat: "ritual", dur: 90, price: 650000, guests: [1, 2], buffer: 15 },
      { slug: "flower-bath-ritual", name: "Flower Bath Ritual", cat: "ritual", dur: 120, price: 900000, guests: [1, 2] },
      { slug: "facial-hydrating", name: "Hydrating Facial", cat: "facial", dur: 60, price: 450000, guests: [1, 2] },
      { slug: "doorstep-massage", name: "Doorstep Massage (Villa)", cat: "massage", dur: 60, price: 400000, guests: [1, 4], home: true, travel: 150000 },
    ],
  },
  {
    slug: "canggu-surf-spa", name: "Canggu Surf Spa", area: "canggu", city: "Canggu",
    lat: -8.6478, lng: 115.1385,
    desc: "DEMO listing — laid-back recovery spa for surfers and digital nomads. Sports massage, cold plunge and stretch therapy.",
    types: ["day-spa"], status: "published",
    treatments: [
      { slug: "sports-massage", name: "Sports Recovery Massage", cat: "massage", dur: 60, price: 380000, guests: [1, 2] },
      { slug: "balinese-massage", name: "Balinese Massage", cat: "massage", dur: 60, price: 320000, guests: [1, 3] },
      { slug: "stretch-therapy", name: "Stretch Therapy", cat: "wellness", dur: 45, price: 280000, guests: [1, 1] },
      { slug: "doorstep-massage", name: "Doorstep Massage", cat: "massage", dur: 60, price: 350000, guests: [1, 3], home: true, travel: 120000 },
    ],
  },
  {
    slug: "nusa-dua-luxe-spa", name: "Nusa Dua Luxe Spa", area: "nusa-dua", city: "Nusa Dua",
    lat: -8.7975, lng: 115.2276,
    desc: "DEMO listing — five-star hotel spa on the Nusa Dua boulevard. Parisian facials, hot stone rituals and ocean-view couple suites.",
    types: ["hotel-spa"], featured: true,
    treatments: [
      { slug: "hot-stone-massage", name: "Hot Stone Massage", cat: "massage", dur: 90, price: 700000, guests: [1, 2], buffer: 15 },
      { slug: "couples-massage", name: "Couples Ocean Massage", cat: "couples", dur: 60, price: 1200000, guests: [2, 2] },
      { slug: "facial-luxe", name: "Luxe Gold Facial", cat: "facial", dur: 75, price: 950000, guests: [1, 2] },
      { slug: "balinese-massage", name: "Balinese Massage", cat: "massage", dur: 60, price: 550000, discount: 10, guests: [1, 3] },
    ],
  },
  {
    slug: "sanur-bay-day-spa", name: "Sanur Bay Day Spa", area: "sanur", city: "Sanur",
    lat: -8.6878, lng: 115.2626,
    desc: "DEMO listing — seaside day spa on Sanur beach road (awaiting admin approval in this demo).",
    types: ["day-spa"], status: "pending",
    treatments: [
      { slug: "balinese-massage", name: "Balinese Massage", cat: "massage", dur: 60, price: 280000, guests: [1, 4] },
      { slug: "sea-salt-scrub", name: "Sea Salt Body Scrub", cat: "body-treatment", dur: 45, price: 320000, guests: [1, 2] },
    ],
  },
];

const THAIERS_NAMES = ["Ayu", "Sari", "Wayan", "Dewi", "Made", "Kadek", "Luh", "Gede"];

for (const s of spas) {
  const status = s.status === "pending" ? "pending" : "published";
  let spaRow = db.prepare("SELECT id FROM spas WHERE slug = ?").get(s.slug) as any;
  let spaId: number;
  if (!spaRow) {
    spaId = Number(
      db.prepare(
        `INSERT INTO spas (supplier_id, slug, name, description, location_id, address, city, country, lat, lng,
           email, phone, whatsapp, opening_hours, facilities, languages, spa_types, gallery, status, is_featured,
           rating_avg, rating_count, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).run(
        status === "pending" && s.status === "pending" ? supplierId : supplierId,
        s.slug, s.name, s.desc, areas[s.area], `${s.name}, ${s.city}`, s.city, "Indonesia", s.lat, s.lng,
        "hello@" + s.slug + ".example", "+62 361 000 000", "+62 812 0000 000", HOT_HOURS,
        JSON.stringify(["WiFi", "Shower", "Parking", "Air Conditioning"]),
        JSON.stringify(["English", "Indonesian", "Japanese"]),
        JSON.stringify(s.types),
        JSON.stringify([]), status, s.featured ? 1 : 0,
        4.5 + Math.random() * 0.4, 20 + Math.floor(Math.random() * 120), now
      ).lastInsertRowid
    );
  } else {
    spaId = spaRow.id;
  }

  // Branch (main) + rooms
  let branch = db.prepare("SELECT id FROM branches WHERE spa_id = ? LIMIT 1").get(spaId) as any;
  let branchId: number;
  if (!branch) {
    branchId = Number(
      db.prepare("INSERT INTO branches (spa_id, name, address, city, lat, lng, opening_hours, capacity) VALUES (?,?,?,?,?,?,?,4)")
        .run(spaId, "Main Branch", `${s.name}, ${s.city}`, s.city, s.lat, s.lng, HOT_HOURS).lastInsertRowid
    );
    for (const rn of ["Room 1", "Room 2", "Room 3", "Couple Suite"]) {
      db.prepare("INSERT INTO rooms (branch_id, name, capacity) VALUES (?,?,?)")
        .run(branchId, rn, rn === "Couple Suite" ? 2 : 1);
    }
  } else {
    branchId = branch.id;
  }

  // Treatments
  const treatmentIds: Record<string, number> = {};
  for (const t of s.treatments) {
    let row = db.prepare("SELECT id FROM treatments WHERE spa_id = ? AND slug = ?").get(spaId, t.slug) as any;
    let tid: number;
    if (!row) {
      tid = Number(
        db.prepare(
          `INSERT INTO treatments (spa_id, slug, name, category_id, description, duration_min, price, discount,
             currency, min_guests, max_guests, room_required, buffer_min, therapist_gender, home_service, travel_fee, status)
           VALUES (?,?,?,?,?,?,?,?, 'IDR', ?,?,1,?,?,?,?,'active')`
        ).run(spaId, t.slug, t.name, tcats[t.cat],
          `${t.name} — DEMO treatment at ${s.name}. ${t.dur} minutes of pure relaxation.`,
          t.dur, t.price, t.discount ?? 0, t.guests[0], t.guests[1], t.buffer ?? 0,
          t.gender ?? "no_pref", t.home ? 1 : 0, t.travel ?? 0).lastInsertRowid
      );
    } else tid = row.id;
    treatmentIds[t.slug] = tid;
    db.prepare("INSERT OR IGNORE INTO treatment_branches (treatment_id, branch_id) VALUES (?,?)").run(tid, branchId);
  }

  // Therapists + schedules + qualifications (skip for the pending spa? no — keep demo complete)
  const existingTh = db.prepare("SELECT COUNT(*) c FROM therapists WHERE spa_id = ?").get(spaId) as any;
  if (existingTh.c === 0) {
    const count = 4;
    for (let i = 0; i < count; i++) {
      const name = THAIERS_NAMES[(i + spaId) % THAIERS_NAMES.length];
      const thId = Number(
        db.prepare(
          `INSERT INTO therapists (spa_id, branch_id, name, gender, specialty, skills, languages, qualifications, status)
           VALUES (?,?,?,?,?,?,?,?, 'active')`
        ).run(spaId, branchId, name, i % 2 === 0 ? "female" : "male",
          "Balinese & Aromatherapy", JSON.stringify(["Balinese", "Aromatherapy", "Deep Tissue"]),
          JSON.stringify(["English", "Indonesian"]),
          JSON.stringify(["Level 3 Balinese Massage Certificate"])).lastInsertRowid
      );
      // Weekly schedule: every day 09:00-18:00 with a midday break (Mon-Sat), Sunday 10:00-17:00
      for (const wd of [1, 2, 3, 4, 5, 6]) {
        db.prepare("INSERT INTO therapist_schedules (therapist_id, weekday, start_time, end_time) VALUES (?,?,?,?)")
          .run(thId, wd, "09:00", "13:00");
        db.prepare("INSERT INTO therapist_schedules (therapist_id, weekday, start_time, end_time) VALUES (?,?,?,?)")
          .run(thId, wd, "14:00", "21:00");
      }
      db.prepare("INSERT INTO therapist_schedules (therapist_id, weekday, start_time, end_time) VALUES (?,?,?,?)")
        .run(thId, 0, "10:00", "17:00");
      // Qualify for all of this spa's treatments except doorstep-only ones for half the staff
      for (const tid of Object.values(treatmentIds)) {
        db.prepare("INSERT OR IGNORE INTO therapist_treatments (therapist_id, treatment_id) VALUES (?,?)").run(thId, tid);
      }
      // Demo therapist user link: first therapist of first spa named after demo account
      if (spaId === 1 && i === 0) {
        db.prepare("UPDATE therapists SET name = 'Demo Therapist' WHERE id = ?").run(thId);
      }
    }
  }
}

// --- Supplier demo spa profile must be linked to demo supplier's user ---------
// (spas above all belong to the demo supplier — one business, many properties.)

// --- Promotions ----------------------------------------------------------------
const promos = [
  ["WELCOME10", "percent", 10, "platform", 0],
  ["BALI15", "percent", 15, "destination", 100000],
  ["FIRSTSPA", "percent", 20, "first_booking", 0],
] as const;
for (const [code, kind, value, scope, min] of promos) {
  if (!db.prepare("SELECT id FROM promotions WHERE code = ?").get(code)) {
    db.prepare(
      `INSERT INTO promotions (code, description, kind, value, min_value, scope, starts_at, ends_at, max_uses, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).run(code, `DEMO promotion ${code}`, kind, value, min, scope,
      new Date(Date.now() - 864e5).toISOString(), new Date(Date.now() + 90 * 864e5).toISOString(), 1000, adminId);
  }
}

// --- Sample bookings + reviews --------------------------------------------------
const anySpa = db.prepare("SELECT id, slug FROM spas WHERE status='published' LIMIT 1").get() as any;
const anyTreat = db.prepare("SELECT id, duration_min, price FROM treatments WHERE spa_id = ? LIMIT 1").get(anySpa.id) as any;
const anyTherapist = db.prepare("SELECT id FROM therapists WHERE spa_id = ? LIMIT 1").get(anySpa.id) as any;
const anyRoom = db.prepare("SELECT r.id FROM rooms r JOIN branches b ON b.id=r.branch_id WHERE b.spa_id=? LIMIT 1").get(anySpa.id) as any;
const anyBranch = db.prepare("SELECT id FROM branches WHERE spa_id = ? LIMIT 1").get(anySpa.id) as any;

if ((db.prepare("SELECT COUNT(*) c FROM bookings").get() as any).c === 0) {
  const mkRef = (i: number) => `BYS-DEMO-${String(i).padStart(4, "0")}`;
  const rows = [
    { date: new Date(Date.now() + 864e5).toISOString().slice(0, 10), time: "10:00", status: "confirmed" },
    { date: new Date(Date.now() + 864e5).toISOString().slice(0, 10), time: "14:00", status: "confirmed" },
    { date: new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10), time: "11:00", status: "completed" },
    { date: new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10), time: "16:00", status: "completed" },
    { date: new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10), time: "09:00", status: "cancelled" },
  ];
  rows.forEach((r, i) => {
    const ref = mkRef(i + 1);
    const bkId = Number(
      db.prepare(
        `INSERT INTO bookings (ref, customer_id, spa_id, branch_id, treatment_id, therapist_id, room_id,
           booking_date, start_time, duration_min, guests, service_type, customer_name, customer_email,
           customer_phone, therapist_preference, status, subtotal, total, currency, cancel_policy)
         VALUES (?,?,?,?,?,?,?,?,?,?,?, 'in_spa', ?,?,?, 'any', ?,?,?,?,?)`
      ).run(ref, customerId, anySpa.id, anyBranch.id, anyTreat.id,
        anyTherapist.id, anyRoom.id, r.date, r.time, anyTreat.duration_min, i % 2 === 0 ? 2 : 1,
        "Demo Customer", "customer@demo.test", "+62 812 0000 000", r.status,
        anyTreat.price, anyTreat.price, "IDR", "Free cancellation up to 24 hours before the appointment.")
        .lastInsertRowid
    );
    db.prepare("INSERT INTO booking_events (booking_id, from_status, to_status, note, actor_role) VALUES (?,?,?,?, 'system')")
      .run(bkId, null, r.status, "DEMO seed data");
    if (r.status === "confirmed") {
      db.prepare("INSERT INTO payments (booking_id, provider, method, amount, currency, status, transaction_id, paid_at) VALUES (?,?,?,?,?, 'paid', ?, datetime('now'))")
        .run(bkId, "sandbox", "qris", anyTreat.price, "IDR", `SBX-DEMO-${i}`);
      const rate = 10;
      const comm = Math.round(anyTreat.price * rate / 100);
      db.prepare("INSERT INTO commissions (booking_id, supplier_id, gross, rate, amount, net, status) VALUES (?,?,?,?,?,?, 'pending')")
        .run(bkId, supplierId, anyTreat.price, rate, comm, anyTreat.price - comm);
    }
    if (r.status === "completed" && i >= 3) {
      db.prepare("INSERT INTO reviews (booking_id, customer_id, spa_id, treatment_id, rating, body, status) VALUES (?,?,?,?,?, 'DEMO review — wonderful treatment, skilled therapist.', 'published')")
        .run(bkId, customerId, anySpa.id, anyTreat.id, i === 3 ? 5 : 4);
      db.prepare("UPDATE spas SET rating_avg = (SELECT ROUND(AVG(rating),1) FROM reviews WHERE spa_id = ? AND status='published'), rating_count = (SELECT COUNT(*) FROM reviews WHERE spa_id = ? AND status='published') WHERE id = ?")
        .run(anySpa.id, anySpa.id, anySpa.id);
    }
  });
}

// --- Pending supplier application (separate business, for admin approval flow) --
const pendingEmail = "pending-spa@demo.test";
const pendingUserId = upsertUser(pendingEmail, "Pending Owner", "supplier", { country: "Indonesia" });
if (!db.prepare("SELECT id FROM suppliers WHERE user_id = ?").get(pendingUserId)) {
  const sid = Number(
    db.prepare(
      `INSERT INTO suppliers (user_id, business_name, description, status, submitted_at) VALUES (?,?,?, 'pending', ?)`
    ).run(pendingUserId, "Sanur Bay Wellness (DEMO)",
      "DEMO supplier application awaiting admin review.", now).lastInsertRowid
  );
  db.prepare(
    `INSERT INTO spas (supplier_id, slug, name, description, location_id, city, country, status)
     VALUES (?,?,?,?,?,?, 'Indonesia', 'pending')`
  ).run(sid, "sanur-bay-day-spa-demo", "Sanur Bay Wellness", "DEMO pending spa.", areas["sanur"], "Sanur");
}

console.log("[seed] demo accounts: customer@demo.test / supplier@demo.test / admin@demo.test (password: Demo123!)");
console.log("[seed] complete.");
