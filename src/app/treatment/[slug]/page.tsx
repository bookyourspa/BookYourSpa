import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { BookingWidget } from "@/components/BookingWidget";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Ctx) {
  const { slug } = await params;
  const db = getDb();
  const t = db
    .prepare(
      `SELECT t.name, t.description, t.duration_min, s.name spa_name FROM treatments t
         JOIN spas s ON s.id = t.spa_id
        WHERE t.slug = ? AND t.status='active' AND s.status='published'`
    )
    .get(slug) as any;
  if (!t) return {};
  return {
    title: `${t.name} — ${t.duration_min} min from ${t.spa_name}`,
    description: (t.description || `Book ${t.name} (${t.duration_min} minutes) with real-time availability.`).slice(0, 155),
    alternates: { canonical: `/treatment/${slug}` },
  };
}

export default async function TreatmentPage({ params }: Ctx) {
  const { slug } = await params;
  const db = getDb();

  const treatment = db
    .prepare(
      `SELECT t.*, c.name category_name, c.slug category_slug, s.name spa_name, s.slug spa_slug,
              s.city spa_city, s.rating_avg spa_rating, s.rating_count spa_reviews,
              s.description spa_description, s.phone spa_phone, s.whatsapp spa_whatsapp,
              s.lat spa_lat, s.lng spa_lng, s.address spa_address, s.cover_url spa_cover
         FROM treatments t
         LEFT JOIN treatment_categories c ON c.id = t.category_id
         JOIN spas s ON s.id = t.spa_id
         JOIN suppliers sup ON sup.id = s.supplier_id
        WHERE t.slug = ? AND t.status='active' AND s.status='published' AND sup.status='approved'`
    )
    .get(slug) as any;
  if (!treatment) notFound();

  const branches = db.prepare("SELECT * FROM branches WHERE spa_id = ? AND status='active'").all(treatment.spa_id) as any[];
  const therapists = db
    .prepare(
      `SELECT th.id, th.name, th.gender, th.specialty, th.languages FROM therapists th
         JOIN therapist_treatments tt ON tt.therapist_id = th.id AND tt.treatment_id = ?
        WHERE th.spa_id = ? AND th.status='active' ORDER BY th.name`
    )
    .all(treatment.id, treatment.spa_id) as any[];
  const related = db
    .prepare(
      `SELECT t.slug, t.name, t.duration_min, t.price, t.discount, t.currency, s.slug spa_slug, s.name spa_name
         FROM treatments t JOIN spas s ON s.id = t.spa_id
        WHERE t.category_id = ? AND t.id != ? AND t.status='active' AND s.status='published'
        LIMIT 4`
    )
    .all(treatment.category_id, treatment.id) as any[];

  const benefits: string[] = treatment.benefits ? JSON.parse(treatment.benefits) : [];
  const images: string[] = treatment.images ? JSON.parse(treatment.images) : [];
  const finalPrice = Math.round(treatment.price * (1 - treatment.discount / 100));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: treatment.name,
    description: treatment.description,
    provider: { "@type": "DaySpa", name: treatment.spa_name },
    offers: {
      "@type": "Offer",
      price: finalPrice,
      priceCurrency: treatment.currency,
      availability: "https://schema.org/InStock",
    },
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav className="text-xs text-ink-soft" aria-label="Breadcrumb">
        <Link href="/">Home</Link> /{" "}
        {treatment.category_slug && <><Link href={`/explore?category=${treatment.category_slug}`}>{treatment.category_name}</Link> / </>}
        <span>{treatment.name}</span>
      </nav>

      <div className="mt-4 grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div
            className="h-52 rounded-2xl bg-cover bg-center sm:h-64"
            style={{ backgroundImage: images[0] ? `url(${images[0]})` : "linear-gradient(135deg,#0f4f45,#17756a 60%,#c2a15a)" }}
          />
          <p className="eyebrow mt-5">{treatment.category_name}</p>
          <h1 className="font-display mt-1 text-3xl font-bold">{treatment.name}</h1>
          <div className="mt-2 flex flex-wrap gap-3 text-sm text-ink-soft">
            <span>⏱ {treatment.duration_min} minutes</span>
            <span>👥 {treatment.min_guests}–{treatment.max_guests} guests</span>
            {treatment.home_service && <span>🚗 doorstep available</span>}
          </div>
          <div className="mt-3 flex items-baseline gap-3">
            <span className="font-display text-3xl font-bold text-jade">
              {treatment.currency} {finalPrice.toLocaleString()}
            </span>
            {treatment.discount > 0 && (
              <>
                <span className="text-ink-soft line-through">{treatment.currency} {treatment.price.toLocaleString()}</span>
                <span className="badge bg-danger text-white">{treatment.discount}% off</span>
              </>
            )}
          </div>

          <p className="mt-4 whitespace-pre-line text-ink-soft">{treatment.description}</p>

          {benefits.length > 0 && (
            <section className="mt-6">
              <h2 className="font-display text-xl font-bold">Benefits</h2>
              <ul className="mt-2 list-inside list-disc space-y-1 text-ink-soft">
                {benefits.map((b) => <li key={b}>{b}</li>)}
              </ul>
            </section>
          )}

          <section className="mt-6">
            <h2 className="font-display text-xl font-bold">Available therapists</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {therapists.map((t) => (
                <span key={t.id} className="chip">{t.name}</span>
              ))}
              {therapists.length === 0 && <span className="text-sm text-ink-soft">Assigned at booking.</span>}
            </div>
          </section>

          <section className="mt-6 rounded-xl border border-[#e8e2d3] bg-white p-5">
            <h2 className="font-display text-xl font-bold">The spa</h2>
            <div className="mt-2 flex items-center gap-4">
              <div className="h-16 w-16 shrink-0 rounded-lg bg-cover bg-center" style={{ backgroundImage: treatment.spa_cover ? `url(${treatment.spa_cover})` : "linear-gradient(135deg,#0f4f45,#c2a15a)" }} />
              <div>
                <Link href={`/spa/${treatment.spa_slug}`} className="font-semibold text-jade hover:underline">
                  {treatment.spa_name}
                </Link>
                <div className="text-sm text-ink-soft">
                  {treatment.spa_address || treatment.spa_city}
                  {treatment.spa_reviews > 0 && ` · ★ ${Number(treatment.spa_rating).toFixed(1)} (${treatment.spa_reviews})`}
                </div>
              </div>
            </div>
          </section>

          {related.length > 0 && (
            <section className="mt-8">
              <h2 className="font-display text-xl font-bold">Related treatments</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {related.map((r) => (
                  <Link key={r.slug} href={`/treatment/${r.slug}`} className="card p-4 transition hover:-translate-y-0.5 hover:border-jade">
                    <div className="font-semibold">{r.name}</div>
                    <div className="mt-1 text-sm text-ink-soft">{r.duration_min} min · {r.spa_name}</div>
                    <div className="mt-1 text-sm font-bold text-jade">
                      {r.currency} {Math.round(r.price * (1 - r.discount / 100)).toLocaleString()}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-5">
          <div className="card p-5">
            <div className="eyebrow">Book now</div>
            <div className="mt-1 font-display text-lg font-bold">See real availability</div>
            <BookingWidget
              spa={{ id: treatment.spa_id, slug: treatment.spa_slug }}
              branches={branches}
              treatments={[treatment]}
              therapists={therapists}
              initialTreatmentId={treatment.id}
            />
          </div>
          <div className="card p-5 text-sm">
            <div className="eyebrow mb-2">Good to know</div>
            <ul className="space-y-1.5 text-ink-soft">
              <li>Free cancellation up to 24h before</li>
              <li>Instant confirmation &amp; voucher</li>
              <li>Pay securely online</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
