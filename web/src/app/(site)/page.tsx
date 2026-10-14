import type { Metadata } from 'next';
import Link from 'next/link';
import {
  SPAS, CATEGORIES, DESTINATIONS, TREATMENT_CATALOG, PACKAGE_CATALOG, OFFERS, REVIEWS, FAQS, SITE,
  priceRange,
} from '@/lib/content';
import { HeroSearch } from '@/components/HeroSearch';
import { SpaCard } from '@/components/SpaCard';
import { Reveal } from '@/components/Reveal';
import { FaqList } from '@/components/FaqList';
import { JsonLd, Stars } from '@/components/ui';
import { money, initials } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Luxury Spa & Wellness Booking — Book Spas Worldwide',
  description:
    'Book luxury spas, signature massages, thermal rituals and spa packages in Bali, Santorini, Dubai, London, Paris, New York, Bangkok and the Maldives. Real-time availability, secure payment, instant confirmation.',
  alternates: { canonical: '/' },
};

const featured = SPAS.filter((s) => s.featured);
const minPriceOf = (slug: string) => {
  const spa = SPAS.find((s) => s.slug === slug);
  return spa ? priceRange(spa).min : null;
};
const spaCard = (s: (typeof SPAS)[number]) => ({
  slug: s.slug, name: s.name, city: s.city, country: s.country, image: s.image,
  summary: s.summary, rating: s.rating, reviewCount: s.reviewCount,
  minPrice: priceRange(s).min, categories: s.categories, featured: s.featured,
});

const orgLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE.name,
  url: SITE.url,
  logo: `${SITE.url}/favicon.svg`,
  email: SITE.email,
  telephone: SITE.phone,
  address: { '@type': 'PostalAddress', streetAddress: SITE.address, addressLocality: 'New York', addressCountry: 'US' },
  sameAs: Object.values(SITE.social),
};

const websiteLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE.name,
  url: SITE.url,
  potentialAction: {
    '@type': 'SearchAction',
    target: { '@type': 'EntryPoint', urlTemplate: `${SITE.url}/spas/?q={search_term_string}` },
    'query-input': 'required name=search_term_string',
  },
};

const spaListLd = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  itemListElement: featured.map((s, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    item: {
      '@type': 'HealthAndBeautyBusiness',
      name: s.name,
      image: `${SITE.url}${s.image}`,
      address: { '@type': 'PostalAddress', streetAddress: s.address, addressLocality: s.city, addressCountry: s.country },
      aggregateRating: { '@type': 'AggregateRating', ratingValue: s.rating, reviewCount: s.reviewCount },
      priceRange: '$$$'.slice(0, s.priceLevel),
      url: `${SITE.url}/spas/${s.slug}/`,
    },
  })),
};

const faqLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQS.map((f) => ({
    '@type': 'Question', name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
};

export default function HomePage() {
  const avgRating = (SPAS.reduce((a, s) => a + s.rating, 0) / SPAS.length).toFixed(1);
  return (
    <>
      <JsonLd data={[orgLd, websiteLd, spaListLd, faqLd]} />

      {/* ————— HERO ————— */}
      <section className="relative flex min-h-[100svh] flex-col justify-end overflow-hidden pb-14 pt-40 sm:pb-20">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/hero/hero-spa.jpg" alt="Infinity pool at a luxury spa resort at golden hour"
          width={1920} height={1080} fetchPriority="high"
          className="absolute inset-0 -z-20 h-full w-full object-cover object-center" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-ink/85 via-ink/55 to-ink/90" />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(200,169,106,0.25),transparent)]" />

        <div className="container-site">
          <div className="max-w-3xl animate-rise">
            <p className="eyebrow text-gold-soft">Luxury wellness, curated</p>
            <h1 className="mt-5 font-display text-5xl leading-[1.04] text-cream sm:text-6xl lg:text-[5.2rem]">
              Where stillness<br className="hidden sm:block" /> becomes an art
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-champagne/85 sm:text-lg">
              Reserve exceptional spas, signature massages and restorative rituals in the world’s most beautiful
              destinations — in under sixty seconds.
            </p>
          </div>

          <div className="mt-10 max-w-5xl animate-rise" style={{ animationDelay: '180ms' }}>
            <HeroSearch />
          </div>

          <dl className="mt-10 flex flex-wrap items-center gap-x-10 gap-y-4 text-champagne/80 animate-rise" style={{ animationDelay: '320ms' }}>
            <div className="flex items-baseline gap-2">
              <dt className="sr-only">Average rating</dt>
              <span className="font-display text-3xl text-cream">{avgRating}</span>
              <dd className="text-sm"><Stars rating={5} /> <span className="ml-1">from {SPAS.reduce((a, s) => a + s.reviewCount, 0).toLocaleString()} guests</span></dd>
            </div>
            <div className="flex items-baseline gap-2">
              <dt className="sr-only">Spas</dt>
              <span className="font-display text-3xl text-cream">{SPAS.length}+</span>
              <dd className="text-sm">vetted sanctuaries</dd>
            </div>
            <div className="flex items-baseline gap-2">
              <dt className="sr-only">Destinations</dt>
              <span className="font-display text-3xl text-cream">{DESTINATIONS.length}</span>
              <dd className="text-sm">destinations worldwide</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* ————— CATEGORIES ————— */}
      <section className="container-site py-20 sm:py-24" aria-labelledby="categories-heading">
        <Reveal className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Browse by ritual</p>
            <h2 id="categories-heading" className="mt-3 font-display text-4xl sm:text-5xl">Spa categories</h2>
          </div>
          <Link href="/treatments/" className="text-sm tracking-wide text-moss underline-offset-8 hover:text-gold hover:underline">
            All treatments →
          </Link>
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((c, i) => (
            <Reveal key={c.slug} delay={i * 60}>
              <Link href={`/treatments/?category=${c.slug}`}
                className="group relative flex aspect-[16/10] items-end overflow-hidden rounded-2xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.image} alt={c.name} width={700} height={440} loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/25 to-transparent" />
                <div className="relative p-6">
                  <h3 className="font-display text-3xl text-cream">{c.name}</h3>
                  <p className="mt-1.5 line-clamp-2 max-w-sm text-sm text-champagne/80">{c.blurb}</p>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ————— FEATURED SPAS ————— */}
      <section className="bg-sand/60 py-20 sm:py-24" aria-labelledby="featured-heading">
        <div className="container-site">
          <Reveal className="mb-10 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Hand-selected</p>
              <h2 id="featured-heading" className="mt-3 font-display text-4xl sm:text-5xl">Featured sanctuaries</h2>
            </div>
            <Link href="/spas/" className="text-sm tracking-wide text-moss underline-offset-8 hover:text-gold hover:underline">
              Explore all spas →
            </Link>
          </Reveal>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {featured.map((s, i) => (
              <Reveal key={s.slug} delay={i * 50}>
                <SpaCard spa={spaCard(s)} priority={i < 4} className="h-full" />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ————— HOW IT WORKS ————— */}
      <section className="container-site py-20 sm:py-24" aria-labelledby="how-heading">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">The BookYourSpa standard</p>
          <h2 id="how-heading" className="mt-3 font-display text-4xl sm:text-5xl">Booked in three quiet minutes</h2>
          <p className="mt-4 text-stone">Every listing is visited, every therapist is vetted, every booking is protected.</p>
        </Reveal>
        <div className="mt-14 grid gap-10 md:grid-cols-3">
          {[
            { n: '01', t: 'Find your ritual', b: 'Filter by destination, treatment and date. Live availability comes straight from each spa’s diary — never an estimate.' },
            { n: '02', t: 'Reserve & pay securely', b: 'One page, one payment, protected by 3-D Secure. Your slot is held the second the payment clears.' },
            { n: '03', t: 'Arrive, exhale, repeat', b: 'Confirmation, directions and arrival notes land in your inbox and dashboard. Reschedule or cancel in two taps.' },
          ].map((step, i) => (
            <Reveal key={step.n} delay={i * 80} className="relative">
              <span className="font-display text-6xl text-gold/40" aria-hidden>{step.n}</span>
              <h3 className="mt-3 font-display text-2xl">{step.t}</h3>
              <p className="mt-3 text-sm leading-relaxed text-stone">{step.b}</p>
              <div className="divider-gold mt-6" />
            </Reveal>
          ))}
        </div>
      </section>

      {/* ————— TREATMENTS ————— */}
      <section className="bg-forest py-20 text-champagne sm:py-24" aria-labelledby="treatments-heading">
        <div className="container-site">
          <Reveal className="mb-10 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Signature menu</p>
              <h2 id="treatments-heading" className="mt-3 font-display text-4xl text-cream sm:text-5xl">Massage treatments & rituals</h2>
            </div>
            <Link href="/treatments/" className="text-sm tracking-wide text-gold-soft underline-offset-8 hover:underline">View full menu →</Link>
          </Reveal>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {TREATMENT_CATALOG.slice(0, 6).map((t, i) => (
              <Reveal key={t.slug} delay={i * 60}>
                <Link href={`/treatments/?q=${t.slug}`} className="group flex h-full flex-col overflow-hidden rounded-2xl bg-moss/40 ring-1 ring-champagne/10 transition-colors hover:bg-moss/70">
                  <div className="relative aspect-[16/10] overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={t.image} alt={t.name} width={640} height={400} loading="lazy"
                      className="h-full w-full object-cover opacity-90 transition-transform duration-700 group-hover:scale-105" />
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="font-display text-2xl text-cream">{t.name}</h3>
                      <span className="whitespace-nowrap text-sm text-gold-soft">from {money(t.price)}</span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-champagne/70">{t.blurb}</p>
                    <span className="mt-4 text-xs uppercase tracking-[0.2em] text-champagne/50">{t.duration} minutes</span>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ————— PACKAGES ————— */}
      <section className="container-site py-20 sm:py-24" aria-labelledby="packages-heading">
        <Reveal className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Half days, full days, no days</p>
            <h2 id="packages-heading" className="mt-3 font-display text-4xl sm:text-5xl">Spa packages</h2>
          </div>
          <Link href="/packages/" className="text-sm tracking-wide text-moss underline-offset-8 hover:text-gold hover:underline">All packages →</Link>
        </Reveal>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {PACKAGE_CATALOG.map((p, i) => (
            <Reveal key={p.slug} delay={i * 60}>
              <article className="card-lux flex h-full flex-col overflow-hidden">
                <div className="relative aspect-[16/11] overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.image} alt={p.name} width={600} height={410} loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-700 hover:scale-105" />
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-display text-2xl">{p.name}</h3>
                    <span className="whitespace-nowrap text-sm font-medium text-moss">{money(p.price)}</span>
                  </div>
                  <p className="mt-2 text-sm text-stone">{p.blurb}</p>
                  <ul className="mt-4 space-y-1.5 text-xs text-stone">
                    {p.includes.slice(0, 3).map((inc) => (
                      <li key={inc} className="flex gap-2"><span className="text-gold" aria-hidden>✦</span>{inc}</li>
                    ))}
                  </ul>
                  <Link href={`/packages/#${p.slug}`} className="mt-auto pt-5 text-xs uppercase tracking-[0.2em] text-moss hover:text-gold">
                    Explore →
                  </Link>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ————— OFFERS ————— */}
      <section className="bg-gradient-to-b from-champagne to-cream py-20 sm:py-24" aria-labelledby="offers-heading">
        <div className="container-site">
          <Reveal className="mb-10 text-center">
            <p className="eyebrow">Limited invitations</p>
            <h2 id="offers-heading" className="mt-3 font-display text-4xl sm:text-5xl">Special offers</h2>
          </Reveal>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {OFFERS.map((o, i) => (
              <Reveal key={o.code} delay={i * 60}>
                <article className="card-lux flex h-full flex-col justify-between border-dashed border-gold/50 p-6">
                  <div>
                    <p className="font-display text-4xl text-gold">
                      {o.discountType === 'percent' ? `${o.value}%` : money(o.value)}
                    </p>
                    <h3 className="mt-2 font-display text-2xl leading-snug">{o.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-stone">{o.description}</p>
                  </div>
                  <div className="mt-6">
                    <p className="rounded-lg border border-dashed border-gold/70 bg-gold/10 px-3 py-2 text-center text-sm font-medium tracking-[0.18em] text-[#8a6d2f]">
                      {o.code}
                    </p>
                    <p className="mt-2 text-center text-[0.7rem] uppercase tracking-[0.16em] text-stone">Valid until {new Date(`${o.endsAt}T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</p>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ————— DESTINATIONS ————— */}
      <section className="container-site py-20 sm:py-24" aria-labelledby="destinations-heading">
        <Reveal className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Near and far</p>
            <h2 id="destinations-heading" className="mt-3 font-display text-4xl sm:text-5xl">Popular destinations</h2>
          </div>
          <Link href="/destinations/" className="text-sm tracking-wide text-moss underline-offset-8 hover:text-gold hover:underline">All destinations →</Link>
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {DESTINATIONS.map((d, i) => (
            <Reveal key={d.slug} delay={i * 45}>
              <Link href={`/destinations/${d.slug}/`} className="group relative flex aspect-[3/4] items-end overflow-hidden rounded-2xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={d.image} alt={`${d.name}, ${d.country}`} width={600} height={800} loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/20 to-transparent" />
                <div className="relative w-full p-5">
                  <p className="text-[0.68rem] uppercase tracking-[0.28em] text-gold-soft">{d.tagline}</p>
                  <h3 className="mt-1 font-display text-3xl text-cream">{d.name}</h3>
                  <p className="mt-1 text-xs text-champagne/70">{SPAS.filter((s) => s.destination === d.slug).length} spas · {d.country}</p>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ————— REVIEWS ————— */}
      <section className="bg-forest py-20 text-champagne sm:py-24" aria-labelledby="reviews-heading">
        <div className="container-site">
          <Reveal className="mb-12 text-center">
            <p className="eyebrow">Guest stories</p>
            <h2 id="reviews-heading" className="mt-3 font-display text-4xl text-cream sm:text-5xl">{SITE.name} guests who found their calm</h2>
            <p className="mt-4 flex items-center justify-center gap-3 text-sm text-champagne/70">
              <Stars rating={5} /> 4.8 average across {SPAS.reduce((a, s) => a + s.reviewCount, 0).toLocaleString()} verified stays
            </p>
          </Reveal>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {REVIEWS.slice(0, 6).map((r, i) => (
              <Reveal key={r.name + i} delay={i * 60}>
                <figure className="flex h-full flex-col rounded-2xl bg-moss/40 p-6 ring-1 ring-champagne/10">
                  <Stars rating={r.rating} />
                  <blockquote className="mt-4 flex-1">
                    <p className="font-display text-xl leading-snug text-cream">{r.title}</p>
                    <p className="mt-3 text-sm leading-relaxed text-champagne/70">{r.body}</p>
                  </blockquote>
                  <figcaption className="mt-6 flex items-center gap-3 border-t border-champagne/10 pt-4">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gold/20 text-sm text-gold-soft">{initials(r.name)}</span>
                    <span>
                      <span className="block text-sm text-cream">{r.name}</span>
                      <span className="block text-xs text-champagne/60">{r.city} · {SPAS.find((s) => s.slug === r.spaSlug)?.name}</span>
                    </span>
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ————— FAQ ————— */}
      <section className="container-site py-20 sm:py-24" aria-labelledby="faq-heading">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <Reveal>
            <p className="eyebrow">Good to know</p>
            <h2 id="faq-heading" className="mt-3 font-display text-4xl sm:text-5xl">Everything you may wish to know</h2>
            <p className="mt-4 text-sm leading-relaxed text-stone">
              Still curious? Our concierge team answers within one business hour.
            </p>
            <Link href="/faq/" className="btn-outline mt-6">Read all FAQs</Link>
          </Reveal>
          <Reveal delay={100}>
            <FaqList items={FAQS.slice(0, 6)} />
          </Reveal>
        </div>
      </section>

      {/* ————— CONTACT CTA ————— */}
      <section className="relative overflow-hidden py-24" aria-labelledby="cta-heading">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/hero/hero-pool.jpg" alt="" aria-hidden width={1920} height={1080} loading="lazy"
          className="absolute inset-0 -z-20 h-full w-full object-cover" />
        <div className="absolute inset-0 -z-10 bg-ink/80" />
        <div className="container-site text-center">
          <Reveal>
            <p className="eyebrow text-gold-soft">Your calm awaits</p>
            <h2 id="cta-heading" className="mx-auto mt-4 max-w-2xl font-display text-4xl text-cream sm:text-6xl">
              The hardest part is choosing which ritual
            </h2>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
              <Link href="/spas/" className="btn-gold">Book now</Link>
              <Link href="/contact/" className="btn-ghost-light">Speak to the concierge</Link>
            </div>
            <p className="mt-8 text-sm text-champagne/60">
              <a href={`tel:${SITE.phone.replace(/[^\d+]/g, '')}`} className="hover:text-gold">{SITE.phone}</a>
              <span className="mx-3" aria-hidden>·</span>
              <a href={`mailto:${SITE.email}`} className="hover:text-gold">{SITE.email}</a>
            </p>
          </Reveal>
        </div>
      </section>
    </>
  );
}
