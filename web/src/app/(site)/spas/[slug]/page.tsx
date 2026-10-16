import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SPAS, SITE, REVIEWS, getSpa, getDestination, spaTreatments, spaPackages, DAYS } from '@/lib/content';
import { BookingWidget } from '@/components/BookingWidget';
import { JsonLd, Stars } from '@/components/ui';
import { money, durationLabel, initials } from '@/lib/format';
import { api } from '@/lib/api';

export const dynamicParams = false;

export function generateStaticParams() {
  return SPAS.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const spa = getSpa(slug);
  if (!spa) return {};
  const dest = getDestination(spa.destination);
  return {
    title: `${spa.name} — ${spa.city} | Book ${spa.name} Spa Online`,
    description: `${spa.summary} Book massages, treatments and spa packages at ${spa.name} in ${spa.city}, ${dest?.name ?? spa.country}. Live availability, instant confirmation.`,
    alternates: { canonical: `/spas/${spa.slug}/` },
    openGraph: {
      title: `${spa.name} — ${spa.city}`,
      description: spa.summary,
      images: [{ url: spa.image, width: 1200, height: 900, alt: spa.name }],
      url: `${SITE.url}/spas/${spa.slug}/`,
    },
  };
}

export default async function SpaDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const spa = getSpa(slug);
  if (!spa) notFound();

  const treatments = spaTreatments(spa);
  const packages = spaPackages(spa);
  const dest = getDestination(spa.destination);

  // live reviews from the API (guest reviews written after launch), with a safe fallback
  let reviews: { name: string; city?: string | null; rating: number; title: string; body: string; createdAt: string }[] = REVIEWS
    .filter((r) => r.spaSlug === spa.slug)
    .map((r) => ({ name: r.name, city: r.city, rating: r.rating, title: r.title, body: r.body, createdAt: `${r.date}T10:00:00.000Z` }));
  try {
    const data = await api<{ items: any[] }>(`/api/reviews?spa=${spa.slug}&limit=6`, { signal: AbortSignal.timeout(4000) });
    if (data.items.length) reviews = data.items;
  } catch {
    // keep content fallback
  }

  const spaLd = {
    '@context': 'https://schema.org',
    '@type': 'HealthAndBeautyBusiness',
    name: spa.name,
    image: `${SITE.url}${spa.image}`,
    url: `${SITE.url}/spas/${spa.slug}/`,
    telephone: SITE.phone,
    email: SITE.email,
    address: { '@type': 'PostalAddress', streetAddress: spa.address, addressLocality: spa.city, addressCountry: spa.country },
    geo: spa.lat && spa.lng ? { '@type': 'GeoCoordinates', latitude: spa.lat, longitude: spa.lng } : undefined,
    aggregateRating: { '@type': 'AggregateRating', ratingValue: spa.rating, reviewCount: spa.reviewCount },
    priceRange: '$'.repeat(spa.priceLevel),
    openingHoursSpecification: spa.hours.map((h, i) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][i],
      opens: h.open, closes: h.close,
    })).filter((_, i) => !spa.hours[i].closed),
    makesOffer: treatments.map((t) => ({
      '@type': 'Offer',
      name: t.name,
      price: t.price,
      priceCurrency: SITE.currency,
      availability: 'https://schema.org/InStock',
    })),
  };

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE.url}/` },
      { '@type': 'ListItem', position: 2, name: 'Spas', item: `${SITE.url}/spas/` },
      { '@type': 'ListItem', position: 3, name: spa.name, item: `${SITE.url}/spas/${spa.slug}/` },
    ],
  };

  return (
    <>
      <JsonLd data={[spaLd, breadcrumbLd]} />

      <section className="relative flex min-h-[52vh] items-end pb-12 pt-44">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={spa.image} alt={`${spa.name}, ${spa.city}`} width={1920} height={1080} fetchPriority="high"
          className="absolute inset-0 -z-20 h-full w-full object-cover" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink/90 via-ink/45 to-ink/60" />
        <div className="container-site">
          <nav aria-label="Breadcrumb" className="mb-4 text-xs text-champagne/70">
            <Link href="/" className="hover:text-gold">Home</Link>
            <span className="mx-2" aria-hidden>/</span>
            <Link href="/spas/" className="hover:text-gold">Spas</Link>
            <span className="mx-2" aria-hidden>/</span>
            <Link href={`/destinations/${spa.destination}/`} className="hover:text-gold">{dest?.name ?? spa.city}</Link>
          </nav>
          <h1 className="font-display text-5xl text-cream sm:text-6xl">{spa.name}</h1>
          <p className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-champagne/85">
            <span className="flex items-center gap-2"><Stars rating={spa.rating} /> {spa.rating.toFixed(1)} · {spa.reviewCount} reviews</span>
            <span>{spa.city}, {spa.country}</span>
            <span className="text-gold-soft">{'$'.repeat(spa.priceLevel)}</span>
          </p>
        </div>
      </section>

      <section className="container-site grid gap-12 py-14 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-12">
          <div>
            <p className="eyebrow">The house</p>
            <h2 className="mt-3 font-display text-4xl">A sanctuary above {spa.city}</h2>
            <div className="mt-5 space-y-4 text-[0.98rem] leading-relaxed text-stone">
              {spa.description.map((p) => <p key={p.slice(0, 24)}>{p}</p>)}
            </div>
          </div>

          {spa.gallery.length > 0 && (
            <div>
              <p className="eyebrow">Gallery</p>
              <h2 className="mt-3 font-display text-4xl">Inside {spa.name}</h2>
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {spa.gallery.map((src, i) => (
                  <a key={`${src}-${i}`} href={src} target="_blank" rel="noopener noreferrer"
                    className="group relative block overflow-hidden rounded-xl border border-ink/8 bg-sand">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`${spa.name} — photo ${i + 1}`} width={600} height={450} loading="lazy"
                      className="aspect-[4/3] w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
                  </a>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="eyebrow">Treatments</p>
            <h2 className="mt-3 font-display text-4xl">Menu & prices</h2>
            <ul className="mt-6 divide-y divide-ink/8 border-y border-ink/8">
              {treatments.map((t) => (
                <li key={t.slug} className="flex items-start justify-between gap-6 py-5">
                  <div>
                    <h3 className="font-display text-2xl">{t.name}</h3>
                    <p className="mt-1 max-w-xl text-sm text-stone">{t.description}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.18em] text-stone">{durationLabel(t.duration)} · {t.category}</p>
                  </div>
                  <div className="whitespace-nowrap pt-1 text-right">
                    <p className="font-display text-2xl text-moss">{money(t.price)}</p>
                    <a href="#book" className="text-xs uppercase tracking-[0.16em] text-gold hover:underline">Book →</a>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {packages.length > 0 && (
            <div>
              <p className="eyebrow">Curated days</p>
              <h2 className="mt-3 font-display text-4xl">Spa packages</h2>
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                {packages.map((p) => (
                  <article key={p.slug} className="card-lux overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.image} alt={p.name} width={600} height={380} loading="lazy" className="aspect-[16/10] w-full object-cover" />
                    <div className="p-5">
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 className="font-display text-2xl">{p.name}</h3>
                        <span className="font-medium text-moss">{money(p.price)}</span>
                      </div>
                      <p className="mt-2 text-sm text-stone">{p.blurb}</p>
                      <ul className="mt-3 space-y-1 text-xs text-stone">
                        {p.includes.map((inc) => <li key={inc} className="flex gap-2"><span className="text-gold" aria-hidden>✦</span>{inc}</li>)}
                      </ul>
                      <p className="mt-3 text-xs uppercase tracking-[0.16em] text-stone">{durationLabel(p.duration)}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <p className="eyebrow">Facilities</p>
              <ul className="mt-4 grid gap-2 text-sm text-stone">
                {spa.facilities.map((f) => <li key={f} className="flex gap-2"><span className="text-gold" aria-hidden>✦</span>{f}</li>)}
              </ul>
            </div>
            <div>
              <p className="eyebrow">Opening hours</p>
              <ul className="mt-4 grid gap-1.5 text-sm">
                {DAYS.map((d, i) => (
                  <li key={d} className="flex justify-between border-b border-ink/6 pb-1.5">
                    <span className="text-stone">{d}</span>
                    <span>{spa.hours[i]?.closed ? 'Closed' : `${spa.hours[i].open} – ${spa.hours[i].close}`}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-sm text-stone">{spa.address}</p>
            </div>
          </div>

          <div>
            <p className="eyebrow">Guest voices</p>
            <h2 className="mt-3 font-display text-4xl">Reviews</h2>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              {(reviews.length ? reviews : []).map((r) => (
                <figure key={r.createdAt + r.name} className="card-lux p-5">
                  <Stars rating={r.rating} />
                  <p className="mt-3 font-display text-xl leading-snug">{r.title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-stone">{r.body}</p>
                  <figcaption className="mt-4 flex items-center gap-3 text-sm">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold/15 text-xs text-[#8a6d2f]">{initials(r.name)}</span>
                    <span><span className="block">{r.name}</span>{r.city && <span className="block text-xs text-stone">{r.city}</span>}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </div>

        <aside id="book" className="lg:sticky lg:top-28 lg:self-start">
          <BookingWidget
            spaSlug={spa.slug}
            treatments={treatments.map((t) => ({ slug: t.slug, name: t.name, durationMin: t.duration, price: t.price }))}
            packages={packages.map((p) => ({ slug: p.slug, name: p.name, durationMin: p.duration, price: p.price }))}
          />
          <p className="mt-4 text-center text-xs text-stone">
            Operated by the spa · Powered by {SITE.name}
          </p>
        </aside>
      </section>
    </>
  );
}
