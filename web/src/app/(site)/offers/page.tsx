import type { Metadata } from 'next';
import Link from 'next/link';
import { OFFERS, SITE } from '@/lib/content';
import { Reveal } from '@/components/Reveal';
import { JsonLd } from '@/components/ui';
import { money } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Special Offers & Spa Deals — BookYourSpa',
  description: 'Current spa offers: 15% off your first booking, 20% off packages, couples deals and morning rates. Apply a code at checkout.',
  alternates: { canonical: '/offers/' },
};

export default function OffersPage() {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: OFFERS.map((o, i) => ({
      '@type': 'ListItem', position: i + 1,
      item: {
        '@type': 'Offer', name: o.title, description: o.description, url: `${SITE.url}/offers/`,
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: o.discountType === 'percent' ? 0 : o.value,
          priceCurrency: SITE.currency,
          description: o.discountType === 'percent' ? `${o.value}% off` : `${money(o.value)} off`,
        },
        validThrough: o.endsAt,
      },
    })),
  };
  return (
    <>
      <JsonLd data={ld} />
      <section className="bg-forest pb-14 pt-40 text-champagne">
        <div className="container-site">
          <p className="eyebrow">Limited invitations</p>
          <h1 className="mt-3 font-display text-5xl text-cream sm:text-6xl">Special offers</h1>
          <p className="mt-3 max-w-2xl text-champagne/75">Copy a code, apply it at booking — the discount appears before you pay.</p>
        </div>
      </section>
      <section className="container-site grid gap-6 py-14 md:grid-cols-2">
        {OFFERS.map((o, i) => (
          <Reveal key={o.code} delay={i * 60}>
            <article className="card-lux grid overflow-hidden sm:grid-cols-[0.8fr_1.2fr]">
              <div className="relative min-h-[200px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={o.image} alt="" aria-hidden width={500} height={400} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                <div className="absolute inset-0 bg-ink/25" />
              </div>
              <div className="p-6">
                <p className="font-display text-5xl text-gold">{o.discountType === 'percent' ? `${o.value}%` : money(o.value)}</p>
                <h2 className="mt-2 font-display text-3xl leading-snug">{o.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-stone">{o.description}</p>
                <p className="mt-4 rounded-lg border border-dashed border-gold/70 bg-gold/10 px-3 py-2 text-center text-sm font-medium tracking-[0.18em] text-[#8a6d2f]">{o.code}</p>
                <p className="mt-3 text-xs text-stone">
                  {o.minSpend > 0 && `Minimum spend ${money(o.minSpend)} · `}Valid {new Date(`${o.startsAt}T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })} – {new Date(`${o.endsAt}T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                </p>
                <Link href="/spas/" className="mt-4 inline-block text-xs uppercase tracking-[0.16em] text-moss hover:text-gold">Find a spa to apply it →</Link>
              </div>
            </article>
          </Reveal>
        ))}
      </section>
    </>
  );
}
