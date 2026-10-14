import type { Metadata } from 'next';
import Link from 'next/link';
import { SPAS, DESTINATIONS, SITE } from '@/lib/content';
import { JsonLd } from '@/components/ui';

export const metadata: Metadata = {
  title: 'About — The BookYourSpa Standard',
  description: 'How BookYourSpa curates, vets and books the world’s finest spas: real-time availability, protected payments and a 15% flat commission.',
  alternates: { canonical: '/about/' },
};

export default function AboutPage() {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    mainEntity: {
      '@type': 'Organization', name: SITE.name, url: SITE.url,
      foundingDate: String(SITE.founded), email: SITE.email, telephone: SITE.phone,
    },
  };
  return (
    <>
      <JsonLd data={ld} />
      <section className="relative flex min-h-[44vh] items-end pb-14 pt-44">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/spa/aurora-lounge.jpg" alt="" aria-hidden width={1920} height={1080} className="absolute inset-0 -z-20 h-full w-full object-cover" />
        <div className="absolute inset-0 -z-10 bg-ink/75" />
        <div className="container-site">
          <p className="eyebrow text-gold-soft">Since {SITE.founded}</p>
          <h1 className="mt-3 max-w-3xl font-display text-5xl text-cream sm:text-6xl">Rest, taken seriously</h1>
        </div>
      </section>
      <section className="container-site grid gap-12 py-16 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-5 text-[1.02rem] leading-relaxed text-stone">
          <p className="text-lg leading-relaxed text-ink">
            {SITE.name} began with a simple frustration: booking a great spa took five phone calls, three emails and a
            printed confirmation nobody could find. We thought the hardest part of wellness should be deciding to rest.
          </p>
          <p>
            Today the platform lists {SPAS.length} vetted houses across {DESTINATIONS.length} destinations — from a
            Georgian bathhouse in Marylebone to a glass-floored treatment room above a Maldivian lagoon. Every spa is
            visited before it joins the collection, every therapist is licensed, and every price you see is the price you pay.
          </p>
          <p>
            Behind the scenes, suppliers manage their diaries in real time: when you see a slot, it is genuinely free.
            Payments run through Stripe with 3-D Secure, and every booking is covered by a 24-hour free-cancellation window.
            Our commission is a flat 15% — no listing fees, no surprises, no pay-to-rank placements.
          </p>
          <p>
            Whether you are booking a sixty-minute reset between meetings or a five-hour retreat with someone you love,
            the standard is the same: quiet rooms, warm hands, and a confirmation before you reach the door.
          </p>
          <div className="pt-4">
            <Link href="/spas/" className="btn-gold">Explore the collection</Link>
          </div>
        </div>
        <aside className="space-y-5">
          {[
            { k: 'Vetted in person', v: 'Every house is visited before listing. No exceptions, no pay-to-rank.' },
            { k: 'Live availability', v: 'Slots come straight from supplier diaries — held the moment payment clears.' },
            { k: 'Protected payments', v: 'Stripe with 3-D Secure. Card data never touches our servers.' },
            { k: 'Fair to suppliers', v: 'Flat 15% commission, next-cycle payouts, and a dashboard that respects their time.' },
          ].map((x) => (
            <div key={x.k} className="card-lux p-6">
              <h2 className="font-display text-2xl">{x.k}</h2>
              <p className="mt-2 text-sm leading-relaxed text-stone">{x.v}</p>
            </div>
          ))}
        </aside>
      </section>
    </>
  );
}
