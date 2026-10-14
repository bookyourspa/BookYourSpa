import type { Metadata } from 'next';
import Link from 'next/link';
import { PACKAGE_CATALOG, SPAS, SITE, priceRange } from '@/lib/content';
import { Reveal, } from '@/components/Reveal';
import { JsonLd } from '@/components/ui';
import { money, durationLabel } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Spa Packages — Retreat Days, Couples Sanctuaries & Escapes',
  description: 'Half-day and full-day spa packages: retreat days, couples sanctuaries, weekend escapes and executive renewal. Bundle treatments and save.',
  alternates: { canonical: '/packages/' },
};

export default function PackagesPage() {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: PACKAGE_CATALOG.map((p, i) => ({
      '@type': 'ListItem', position: i + 1,
      item: {
        '@type': 'Product', name: p.name, description: p.blurb, image: `${SITE.url}${p.image}`,
        offers: { '@type': 'Offer', price: p.price, priceCurrency: SITE.currency, availability: 'https://schema.org/InStock' },
      },
    })),
  };
  return (
    <>
      <JsonLd data={ld} />
      <section className="bg-forest pb-14 pt-40 text-champagne">
        <div className="container-site">
          <p className="eyebrow">Curated days</p>
          <h1 className="mt-3 font-display text-5xl text-cream sm:text-6xl">Spa packages</h1>
          <p className="mt-3 max-w-2xl text-champagne/75">When one treatment will not quite do it. Every package is available at multiple houses — prices shown are the lowest.</p>
        </div>
      </section>
      <section className="container-site space-y-10 py-14">
        {PACKAGE_CATALOG.map((p, i) => {
          const spas = SPAS.filter((s) => s.packages.some((x) => x.slug === p.slug));
          return (
            <Reveal key={p.slug} delay={i * 60}>
              <article id={p.slug} className="card-lux grid overflow-hidden md:grid-cols-[0.9fr_1.1fr]">
                <div className="relative min-h-[260px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.image} alt={p.name} width={800} height={600} loading={i === 0 ? 'eager' : 'lazy'} className="absolute inset-0 h-full w-full object-cover" />
                </div>
                <div className="p-7">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <h2 className="font-display text-4xl">{p.name}</h2>
                    <p className="text-right">
                      <span className="block font-display text-3xl text-moss">from {money(spas.length ? Math.min(...spas.map((s) => s.packages.find((x) => x.slug === p.slug)?.price ?? p.price)) : p.price)}</span>
                      <span className="text-xs uppercase tracking-[0.16em] text-stone">{durationLabel(p.duration)}</span>
                    </p>
                  </div>
                  <p className="mt-3 text-[0.95rem] leading-relaxed text-stone">{p.blurb}</p>
                  <ul className="mt-5 grid gap-2 sm:grid-cols-2">
                    {p.includes.map((inc) => (
                      <li key={inc} className="flex gap-2 text-sm text-stone"><span className="text-gold" aria-hidden>✦</span>{inc}</li>
                    ))}
                  </ul>
                  <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-ink/8 pt-5">
                    <Link href={spas[0] ? `/spas/${spas[0].slug}/#book` : '/spas/'} className="btn-ink !px-6 !py-2.5">Book this package</Link>
                    <span className="text-xs text-stone">Available at {spas.length} houses incl. {spas.slice(0, 2).map((s) => s.name).join(', ')}</span>
                  </div>
                </div>
              </article>
            </Reveal>
          );
        })}
      </section>
    </>
  );
}
