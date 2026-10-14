import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DESTINATIONS, SPAS, getDestination, SITE } from '@/lib/content';
import { SpaCard } from '@/components/SpaCard';
import { priceRange } from '@/lib/content';
import { JsonLd } from '@/components/ui';

export const dynamicParams = false;
export function generateStaticParams() { return DESTINATIONS.map((d) => ({ slug: d.slug })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const d = getDestination(slug);
  if (!d) return {};
  return {
    title: `Best Spas in ${d.name}, ${d.country} — Book Online`,
    description: `${d.blurb} Discover ${SPAS.filter((s) => s.destination === slug).length} vetted spas in ${d.name} with live availability and instant confirmation.`,
    alternates: { canonical: `/destinations/${d.slug}/` },
    openGraph: { title: `Spas in ${d.name}`, description: d.blurb, images: [{ url: d.image }] },
  };
}

export default async function DestinationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const d = getDestination(slug);
  if (!d) notFound();
  const spas = SPAS.filter((s) => s.destination === slug);

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `Spas in ${d.name}`,
    url: `${SITE.url}/destinations/${d.slug}/`,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: spas.map((s, i) => ({
        '@type': 'ListItem', position: i + 1,
        item: { '@type': 'HealthAndBeautyBusiness', name: s.name, aggregateRating: { '@type': 'AggregateRating', ratingValue: s.rating, reviewCount: s.reviewCount } },
      })),
    },
  };

  return (
    <>
      <JsonLd data={ld} />
      <section className="relative flex min-h-[46vh] items-end pb-12 pt-44">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={d.image} alt={`${d.name}, ${d.country}`} width={1920} height={1080} fetchPriority="high" className="absolute inset-0 -z-20 h-full w-full object-cover" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink/90 via-ink/45 to-ink/60" />
        <div className="container-site">
          <nav aria-label="Breadcrumb" className="mb-4 text-xs text-champagne/70">
            <Link href="/" className="hover:text-gold">Home</Link>
            <span className="mx-2" aria-hidden>/</span>
            <Link href="/destinations/" className="hover:text-gold">Destinations</Link>
            <span className="mx-2" aria-hidden>/</span>
            <span>{d.name}</span>
          </nav>
          <p className="eyebrow text-gold-soft">{d.tagline}</p>
          <h1 className="mt-2 font-display text-5xl text-cream sm:text-6xl">Spas in {d.name}</h1>
          <p className="mt-3 max-w-2xl text-champagne/80">{d.blurb}</p>
        </div>
      </section>

      <section className="container-site py-14">
        <h2 className="sr-only">Spas in {d.name}</h2>
        {spas.length === 0 ? (
          <p className="py-16 text-center text-stone">New spas are joining {d.name} soon.</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {spas.map((s) => (
              <SpaCard key={s.slug} spa={{
                slug: s.slug, name: s.name, city: s.city, country: s.country, image: s.image,
                summary: s.summary, rating: s.rating, reviewCount: s.reviewCount,
                minPrice: priceRange(s).min, categories: s.categories, featured: s.featured,
              }} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
