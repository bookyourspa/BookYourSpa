import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { BookingWidget } from "@/components/BookingWidget";
import { ReviewList } from "@/components/ReviewList";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ slug: string }>;
}

/** Handles BOTH /spa/[location] (SEO destination pages) and /spa/[slug] (profiles). */
export async function generateMetadata({ params }: Ctx) {
  const { slug } = await params;
  const db = getDb();
  const loc = db.prepare("SELECT name, kind FROM locations WHERE slug = ?").get(slug) as any;
  if (loc) {
    return {
      title: `Spa in ${loc.name} — book treatments with real-time availability`,
      description: `Discover and book the best spas in ${loc.name}. Compare treatments, prices and live therapist availability on Book Your Spa.`,
      alternates: { canonical: `/spa/${slug}` },
    };
  }
  const spa = db.prepare("SELECT name, description, city FROM spas WHERE slug = ? AND status='published'").get(slug) as any;
  if (!spa) return {};
  return {
    title: `${spa.name} — ${spa.city || ""} | Book online`,
    description: (spa.description || `Book treatments at ${spa.name}`).slice(0, 155),
    alternates: { canonical: `/spa/${slug}` },
    openGraph: { title: spa.name, description: spa.description || undefined },
  };
}

function JsonHourTable({ hours }: { hours: Record<string, string[]> | null }) {
  const days: [string, string][] = [["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"], ["thu", "Thursday"], ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"]];
  return (
    <table className="table-spa">
      <tbody>
        {days.map(([k, label]) => (
          <tr key={k}>
            <td className="font-semibold">{label}</td>
            <td>{hours?.[k] ? `${hours[k][0]} – ${hours[k][1]}` : "Closed"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function SpaPage({ params }: Ctx) {
  const { slug } = await params;
  const db = getDb();

  // --- Destination (SEO) page: /spa/bali, /spa/seminyak, ... ------------------
  const loc = db.prepare("SELECT * FROM locations WHERE slug = ?").get(slug) as any;
  if (loc) {
    const sps = db
      .prepare(
        `SELECT s.id, s.slug, s.name, s.city, s.country, s.cover_url, s.rating_avg, s.rating_count,
                s.spa_types, s.description, s.is_featured,
                (SELECT MIN(price) FROM treatments t WHERE t.spa_id = s.id AND t.status='active') price_from,
                (SELECT currency FROM treatments t WHERE t.spa_id = s.id AND t.status='active') currency,
                (SELECT COUNT(*) FROM treatments t WHERE t.spa_id = s.id AND t.status='active') treatment_count
           FROM spas s JOIN suppliers sup ON sup.id = s.supplier_id
          WHERE s.status='published' AND sup.status='approved'
            AND (s.location_id = ? OR s.city = ? OR EXISTS (
                 SELECT 1 FROM locations c WHERE c.id = s.location_id
                   AND (c.parent_id = ? OR c.id = ?)))
          ORDER BY s.is_featured DESC, s.rating_avg DESC LIMIT 48`
      )
      .all(loc.id, loc.name, loc.id, loc.id) as any[];
    const popular = db
      .prepare(
        `SELECT DISTINCT t.slug, t.name FROM treatments t JOIN spas s ON s.id = t.spa_id
          WHERE t.status='active' AND s.status='published' ORDER BY t.name LIMIT 12`
      )
      .all() as any[];

    return (
      <div className="mx-auto max-w-7xl px-4 py-10">
        <nav className="text-xs text-ink-soft" aria-label="Breadcrumb">
          <Link href="/">Home</Link> / <Link href="/explore">Explore</Link> / <span>{loc.name}</span>
        </nav>
        <p className="eyebrow mt-3">{loc.kind === "country" ? "Country" : loc.kind === "region" ? "Region" : loc.kind === "city" ? "City" : "Area"}</p>
        <h1 className="font-display mt-1 text-3xl font-bold">Spas in {loc.name}</h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          Compare {sps.length} vetted spa{sps.length === 1 ? "" : "s"} in {loc.name} — see live availability,
          transparent prices and book instantly.
        </p>
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {sps.map((s) => (
            <Link key={s.id} href={`/spa/${s.slug}`} className="card overflow-hidden transition hover:-translate-y-0.5 hover:border-jade">
              <div className="h-40 bg-cover bg-center" style={{ backgroundImage: s.cover_url ? `url(${s.cover_url})` : "linear-gradient(135deg,#0f4f45,#17756a 60%,#c2a15a)" }} />
              <div className="p-4">
                <div className="font-display text-lg font-bold">{s.name}</div>
                <div className="mt-1 text-sm text-ink-soft">📍 {s.city} · ★ {Number(s.rating_avg).toFixed(1)} ({s.rating_count})</div>
                {s.price_from && <div className="mt-2 text-sm font-bold text-jade">from {s.currency} {Number(s.price_from).toLocaleString()}</div>}
              </div>
            </Link>
          ))}
        </div>
        {sps.length === 0 && (
          <div className="card mt-6 p-10 text-center text-ink-soft">No published spas in this destination yet.</div>
        )}
        <section className="mt-10 rounded-xl bg-white p-6 text-sm text-ink-soft">
          <h2 className="font-display text-lg font-bold text-ink">About {loc.name} spas</h2>
          <p className="mt-2">
            Book Your Spa lists verified wellness businesses in {loc.name}. Filter by treatment type,
            duration, price and service type (in-spa or doorstep), then book with live therapist
            availability — no phone calls needed.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {popular.map((t) => (
              <Link key={t.slug} href={`/treatment/${t.slug}`} className="chip hover:border-jade">{t.name}</Link>
            ))}
          </div>
        </section>
      </div>
    );
  }

  // --- Spa profile page -------------------------------------------------------
  const data = db
    .prepare(
      `SELECT s.*, sup.business_name, sup.status supplier_status FROM spas s
        JOIN suppliers sup ON sup.id = s.supplier_id
        WHERE s.slug = ? AND s.status = 'published' AND sup.status = 'approved'`
    )
    .get(slug) as any;
  if (!data) notFound();

  const branches = db.prepare("SELECT * FROM branches WHERE spa_id = ? AND status='active'").all(data.id) as any[];
  const treatments = db
    .prepare(
      `SELECT t.*, c.name category_name, c.slug category_slug FROM treatments t
         LEFT JOIN treatment_categories c ON c.id = t.category_id
        WHERE t.spa_id = ? AND t.status='active' ORDER BY t.price`
    )
    .all(data.id) as any[];
  const therapists = db
    .prepare("SELECT id, name, gender, specialty, languages, photo_url FROM therapists WHERE spa_id = ? AND status='active' ORDER BY name")
    .all(data.id) as any[];
  const reviews = db
    .prepare(
      `SELECT r.*, u.full_name customer_name, t.name treatment_name FROM reviews r
         JOIN users u ON u.id = r.customer_id LEFT JOIN treatments t ON t.id = r.treatment_id
        WHERE r.spa_id = ? AND r.status='published' ORDER BY r.created_at DESC LIMIT 20`
    )
    .all(data.id) as any[];

  const hours = data.opening_hours ? JSON.parse(data.opening_hours) : null;
  const facilities: string[] = JSON.parse(data.facilities || "[]");
  const languages: string[] = JSON.parse(data.languages || "[]");
  const spaTypes: string[] = JSON.parse(data.spa_types || "[]");
  const gallery: string[] = JSON.parse(data.gallery || "[]");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "DaySpa",
    name: data.name,
    description: data.description,
    address: { "@type": "PostalAddress", streetAddress: data.address, addressLocality: data.city, addressCountry: data.country },
    geo: data.lat ? { "@type": "GeoCoordinates", latitude: data.lat, longitude: data.lng } : undefined,
    aggregateRating: data.rating_count > 0 ? { "@type": "AggregateRating", ratingValue: data.rating_avg, reviewCount: data.rating_count } : undefined,
    priceRange: treatments[0] ? `${treatments[0].currency} ${treatments[0].price}` : undefined,
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav className="text-xs text-ink-soft" aria-label="Breadcrumb">
        <Link href="/">Home</Link> / <Link href="/explore">Explore</Link> /{" "}
        {data.city && <><Link href={`/spa/${data.city.toLowerCase().replace(/\s+/g, "-")}`}>{data.city}</Link> / </>}
        <span>{data.name}</span>
      </nav>

      {/* Cover */}
      <div
        className="mt-3 h-56 rounded-2xl bg-cover bg-center sm:h-72"
        style={{ backgroundImage: data.cover_url ? `url(${data.cover_url})` : "linear-gradient(135deg,#0f4f45 0%,#17756a 55%,#c2a15a 130%)" }}
      />

      <div className="mt-6 grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-3xl font-bold">{data.name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-ink-soft">
                <span>📍 {data.address || data.city}</span>
                {data.rating_count > 0 && <span className="badge bg-jade-pale text-jade">★ {Number(data.rating_avg).toFixed(1)} · {data.rating_count} reviews</span>}
                {spaTypes.map((t) => <span key={t} className="chip !py-0.5">{t.replace(/-/g, " ")}</span>)}
              </div>
            </div>
            {data.phone && (
              <a href={`https://wa.me/${(data.whatsapp || data.phone).replace(/[^0-9]/g, "")}`} className="btn btn-outline text-xs" target="_blank" rel="noopener">
                WhatsApp
              </a>
            )}
          </div>

          <p className="mt-4 whitespace-pre-line text-ink-soft">{data.description}</p>

          {gallery.length > 0 && (
            <div className="mt-5 grid grid-cols-3 gap-2">
              {gallery.slice(0, 6).map((g, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={g} alt={`${data.name} photo ${i + 1}`} className="h-28 w-full rounded-lg object-cover" loading="lazy" />
              ))}
            </div>
          )}

          {/* Treatments */}
          <section id="treatments" className="mt-8">
            <h2 className="font-display text-2xl font-bold">Treatments & prices</h2>
            <div className="mt-4 space-y-3">
              {treatments.map((t) => (
                <div key={t.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <Link href={`/treatment/${t.slug}`} className="font-semibold hover:text-jade hover:underline">
                      {t.name}
                    </Link>
                    <div className="mt-0.5 text-sm text-ink-soft">
                      {t.duration_min} min · {t.min_guests}–{t.max_guests} guests
                      {t.category_name ? ` · ${t.category_name}` : ""}
                      {t.home_service ? " · doorstep available" : ""}
                    </div>
                    {t.discount > 0 && <span className="badge mt-1 bg-danger text-white">{t.discount}% off</span>}
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-jade">
                      {t.currency} {Math.round(t.price * (1 - t.discount / 100)).toLocaleString()}
                    </div>
                    <Link href={`/book/${data.slug}?treatment=${t.id}`} className="btn btn-primary mt-2 !px-4 !py-1.5 text-xs">
                      Book now
                    </Link>
                  </div>
                </div>
              ))}
              {treatments.length === 0 && <p className="text-ink-soft">No treatments published yet.</p>}
            </div>
          </section>

          {/* Therapists */}
          <section className="mt-8">
            <h2 className="font-display text-2xl font-bold">Our therapists</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {therapists.map((t) => (
                <div key={t.id} className="card p-4">
                  <div className="font-semibold">{t.name}</div>
                  <div className="mt-0.5 text-sm text-ink-soft">{t.specialty || "Therapist"}</div>
                  <div className="mt-1 text-xs text-ink-soft">
                    {typeof t.languages === "string" ? JSON.parse(t.languages).join(" · ") : ""}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Reviews */}
          <section className="mt-8">
            <h2 className="font-display text-2xl font-bold">Reviews</h2>
            <ReviewList reviews={reviews} />
          </section>
        </div>

        {/* Sidebar / booking */}
        <aside className="space-y-5">
          <div className="card p-5">
            <div className="eyebrow">Book now</div>
            <div className="mt-1 font-display text-lg font-bold">Check live availability</div>
            <BookingWidget spa={data} branches={branches} treatments={treatments} therapists={therapists} />
          </div>

          <div className="card p-5">
            <div className="eyebrow mb-2">Opening hours</div>
            <JsonHourTable hours={hours} />
          </div>

          <div className="card p-5 text-sm">
            <div className="eyebrow mb-2">Facilities</div>
            <div className="flex flex-wrap gap-1.5">
              {facilities.map((f) => <span key={f} className="chip">{f}</span>)}
              {facilities.length === 0 && <span className="text-ink-soft">—</span>}
            </div>
            <div className="eyebrow mt-4 mb-2">Languages</div>
            <div className="flex flex-wrap gap-1.5">
              {languages.map((l) => <span key={l} className="chip">{l}</span>)}
            </div>
          </div>

          <div className="card p-5 text-sm">
            <div className="eyebrow mb-2">Location</div>
            <div className="text-ink-soft">{data.address}</div>
            {data.lat && (
              <a
                className="mt-2 inline-block font-semibold text-jade hover:underline"
                href={`https://www.google.com/maps/search/?api=1&query=${data.lat},${data.lng}`}
                target="_blank"
                rel="noopener"
              >
                Open in Google Maps →
              </a>
            )}
            <div className="eyebrow mt-4 mb-2">Cancellation policy</div>
            <div className="text-ink-soft">Free cancellation up to {data.cancel_hours} hours before your appointment.</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
