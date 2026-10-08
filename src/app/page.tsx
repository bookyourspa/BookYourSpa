import Link from "next/link";
import { getDb } from "@/lib/db";
import { SpaCard } from "@/components/SpaCard";

export const dynamic = "force-dynamic";

const CATEGORIES = [
  ["massage", "Massage", "💆"],
  ["couples", "Couples", "💞"],
  ["facial", "Facials", "✨"],
  ["body-treatment", "Body Treatments", "🌿"],
  ["ritual", "Rituals", "🕯️"],
  ["wellness", "Wellness", "🧘"],
];

const DESTINATIONS = [
  ["bali", "Bali"],
  ["seminyak", "Seminyak"],
  ["ubud", "Ubud"],
  ["canggu", "Canggu"],
  ["nusa-dua", "Nusa Dua"],
  ["sanur", "Sanur"],
  ["jimbaran", "Jimbaran"],
];

function SearchBox() {
  return (
    <form action="/explore" className="mx-auto flex w-full max-w-3xl flex-col gap-3 sm:flex-row">
      <div className="flex-1">
        <input
          name="q"
          placeholder="Try “Balinese massage” or “couples spa”…"
          className="input !rounded-full !px-6 !py-3.5 text-base shadow-lg"
          aria-label="Search treatments or spas"
        />
      </div>
      <div className="w-full sm:w-52">
        <input
          name="location"
          placeholder="Bali, Seminyak…"
          className="input !rounded-full !px-5 !py-3.5 text-base shadow-lg"
          aria-label="Destination"
        />
      </div>
      <button type="submit" className="btn btn-gold !rounded-full !px-8 !py-3.5 shadow-lg">
        Search
      </button>
    </form>
  );
}

export default function HomePage() {
  const db = getDb();
  const featured = db
    .prepare(
      `SELECT s.id, s.slug, s.name, s.city, s.country, s.cover_url, s.rating_avg, s.rating_count,
              s.spa_types, s.description,
              (SELECT MIN(price) FROM treatments t WHERE t.spa_id = s.id AND t.status='active') price_from,
              (SELECT currency FROM treatments t WHERE t.spa_id = s.id AND t.status='active') currency
         FROM spas s JOIN suppliers sup ON sup.id = s.supplier_id
        WHERE s.status='published' AND sup.status='approved'
        ORDER BY s.is_featured DESC, s.rating_count DESC LIMIT 6`
    )
    .all() as any[];

  const popularTreatments = db
    .prepare(
      `SELECT DISTINCT t.slug, t.name, t.duration_min, t.price, t.currency
         FROM treatments t JOIN spas s ON s.id = t.spa_id
        WHERE t.status='active' AND s.status='published'
        ORDER BY t.name LIMIT 8`
    )
    .all() as any[];

  const stats = db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM spas WHERE status='published') spas,
              (SELECT COUNT(*) FROM treatments WHERE status='active') treatments,
              (SELECT COUNT(*) FROM therapists WHERE status='active') therapists`
    )
    .get() as any;
  const destinationCount = (db.prepare("SELECT COUNT(*) c FROM locations WHERE kind IN ('region','city','area')").get() as any).c;

  return (
    <>
      {/* Hero */}
      <section className="hero-gradient relative overflow-hidden text-white">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:py-28">
          <p className="eyebrow !text-gold">The world&apos;s premier spa platform</p>
          <h1 className="font-display mt-3 max-w-3xl text-4xl font-bold leading-tight sm:text-6xl">
            Discover. Compare. Book.
            <span className="block text-gold">Relax.</span>
          </h1>
          <p className="mt-5 max-w-xl text-white/80">
            Real-time availability at trusted spas in Bali and beyond — book treatments,
            therapists and doorstep massage in under a minute.
          </p>
          <div className="mt-8">
            <SearchBox />
          </div>
          <div className="mt-6 flex flex-wrap gap-2 text-sm">
            {DESTINATIONS.map(([slug, name]) => (
              <Link
                key={slug}
                href={`/spa/${slug}`}
                className="rounded-full border border-white/25 bg-white/10 px-4 py-1.5 backdrop-blur hover:bg-white/20"
              >
                Spa in {name}
              </Link>
            ))}
          </div>
          <dl className="mt-12 grid max-w-2xl grid-cols-3 gap-6 border-t border-white/15 pt-6 text-sm">
            <div>
              <dt className="text-white/60">Published spas</dt>
              <dd className="font-display text-3xl font-bold text-gold">{stats?.spas ?? 0}</dd>
            </div>
            <div>
              <dt className="text-white/60">Treatments</dt>
              <dd className="font-display text-3xl font-bold text-gold">{stats?.treatments ?? 0}</dd>
            </div>
            <div>
              <dt className="text-white/60">Destinations</dt>
              <dd className="font-display text-3xl font-bold text-gold">{destinationCount}</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Categories */}
      <section className="mx-auto max-w-7xl px-4 py-14">
        <p className="eyebrow">Browse by category</p>
        <h2 className="font-display mt-1 text-3xl font-bold">Treatments for every mood</h2>
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {CATEGORIES.map(([slug, name, icon]) => (
            <Link
              key={slug}
              href={`/explore?category=${slug}`}
              className="card flex flex-col items-center gap-2 p-5 text-center transition hover:-translate-y-0.5 hover:border-jade"
            >
              <span className="text-3xl">{icon}</span>
              <span className="text-sm font-semibold">{name}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured spas */}
      <section className="bg-white py-14">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="eyebrow">Featured</p>
              <h2 className="font-display mt-1 text-3xl font-bold">Top-rated spas</h2>
            </div>
            <Link href="/explore" className="text-sm font-semibold text-jade hover:underline">
              View all →
            </Link>
          </div>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((s) => (
              <SpaCard key={s.id} spa={s} />
            ))}
          </div>
        </div>
      </section>

      {/* Popular treatments */}
      <section className="mx-auto max-w-7xl px-4 py-14">
        <p className="eyebrow">Popular now</p>
        <h2 className="font-display mt-1 text-3xl font-bold">Signature treatments</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {popularTreatments.map((t) => (
            <Link key={t.slug} href={`/treatment/${t.slug}`} className="card p-5 transition hover:-translate-y-0.5 hover:border-jade">
              <div className="font-semibold">{t.name}</div>
              <div className="mt-1 text-sm text-ink-soft">{t.duration_min} min</div>
              <div className="mt-3 text-jade font-bold">
                from {t.currency} {Number(t.price).toLocaleString()}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-jade text-white py-14">
        <div className="mx-auto max-w-7xl px-4">
          <p className="eyebrow !text-gold">How it works</p>
          <h2 className="font-display mt-1 text-3xl font-bold">Find → Choose → Book → Relax</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["1", "Find a spa", "Search by destination, treatment or time."],
              ["2", "Choose treatment", "Compare prices, durations and therapists."],
              ["3", "See real availability", "Live slots — never a wasted trip."],
              ["4", "Book & pay", "Instant confirmation, voucher and QR code."],
            ].map(([n, t, d]) => (
              <div key={n} className="rounded-xl border border-white/15 bg-white/5 p-5">
                <div className="font-display text-3xl font-bold text-gold">{n}</div>
                <div className="mt-2 font-semibold">{t}</div>
                <div className="mt-1 text-sm text-white/70">{d}</div>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/explore" className="btn btn-gold">Explore spas</Link>
            <Link href="/list-your-spa" className="btn border border-white/40 text-white hover:bg-white/10">
              List your spa
            </Link>
          </div>
        </div>
      </section>

      {/* SEO copy */}
      <section className="mx-auto max-w-4xl px-4 py-14 text-center">
        <h2 className="font-display text-2xl font-bold">The world&apos;s premier spa booking platform</h2>
        <p className="mt-3 text-ink-soft">
          Book Your Spa connects travellers with vetted spas, wellness centres and doorstep massage
          therapists — from Seminyak and Ubud to Nusa Dua and beyond. Check live therapist
          availability, see transparent prices, pay securely online and receive an instant voucher.
          Spa partners manage branches, treatments, schedules and revenue from one dashboard.
        </p>
      </section>
    </>
  );
}
