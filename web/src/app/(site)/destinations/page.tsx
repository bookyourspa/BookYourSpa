import type { Metadata } from 'next';
import Link from 'next/link';
import { DESTINATIONS, SPAS } from '@/lib/content';
import { Reveal } from '@/components/Reveal';
import { JsonLd } from '@/components/ui';
import { SITE } from '@/lib/content';

export const metadata: Metadata = {
  title: 'Spa Destinations — Bali, Santorini, Dubai, London & More',
  description: 'Browse luxury spa destinations worldwide: Bali, Santorini, Dubai, London, Paris, New York, Bangkok and the Maldives. Compare spas, prices and guest ratings.',
  alternates: { canonical: '/destinations/' },
};

export default function DestinationsPage() {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: DESTINATIONS.map((d, i) => ({
      '@type': 'ListItem', position: i + 1,
      item: { '@type': 'TouristDestination', name: d.name, description: d.blurb, url: `${SITE.url}/destinations/${d.slug}/` },
    })),
  };
  return (
    <>
      <JsonLd data={ld} />
      <section className="bg-forest pb-14 pt-40 text-champagne">
        <div className="container-site">
          <p className="eyebrow">Where calm lives</p>
          <h1 className="mt-3 font-display text-5xl text-cream sm:text-6xl">Popular destinations</h1>
          <p className="mt-3 max-w-2xl text-champagne/75">Eight destinations, one standard. Every spa is visited before it joins the collection.</p>
        </div>
      </section>
      <section className="container-site grid gap-6 py-14 sm:grid-cols-2 lg:grid-cols-3">
        {DESTINATIONS.map((d, i) => {
          const count = SPAS.filter((s) => s.destination === d.slug).length;
          return (
            <Reveal key={d.slug} delay={i * 50}>
              <Link href={`/destinations/${d.slug}/`} className="group relative flex aspect-[4/5] items-end overflow-hidden rounded-2xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={d.image} alt={`${d.name}, ${d.country}`} width={700} height={875} loading={i < 3 ? 'eager' : 'lazy'}
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/25 to-transparent" />
                <div className="relative w-full p-6">
                  <p className="text-[0.68rem] uppercase tracking-[0.28em] text-gold-soft">{d.tagline}</p>
                  <h2 className="mt-1 font-display text-4xl text-cream">{d.name}</h2>
                  <p className="mt-1.5 text-sm text-champagne/75">{count} {count === 1 ? 'spa' : 'spas'} · {d.country}</p>
                  <p className="mt-2 line-clamp-2 text-sm text-champagne/70">{d.blurb}</p>
                </div>
              </Link>
            </Reveal>
          );
        })}
      </section>
    </>
  );
}
