import type { Metadata } from 'next';
import Link from 'next/link';
import { FAQS, SITE } from '@/lib/content';
import { FaqList } from '@/components/FaqList';
import { JsonLd } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Frequently Asked Questions — Bookings, Payments & Cancellations',
  description: 'How booking, payment, cancellation, refunds and supplier approvals work on BookYourSpa. Quick answers from the concierge team.',
  alternates: { canonical: '/faq/' },
};

export default function FaqPage() {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
  return (
    <>
      <JsonLd data={ld} />
      <section className="bg-forest pb-14 pt-40 text-champagne">
        <div className="container-site">
          <p className="eyebrow">Good to know</p>
          <h1 className="mt-3 font-display text-5xl text-cream sm:text-6xl">Frequently asked questions</h1>
          <p className="mt-3 max-w-2xl text-champagne/75">Everything about availability, payment, cancellation and becoming a supplier.</p>
        </div>
      </section>
      <section className="container-site grid gap-12 py-14 lg:grid-cols-[1.4fr_0.6fr]">
        <FaqList items={FAQS} />
        <aside className="card-lux h-fit p-7">
          <h2 className="font-display text-3xl">Still curious?</h2>
          <p className="mt-3 text-sm leading-relaxed text-stone">Our concierge team answers within one business hour, seven days a week.</p>
          <div className="mt-5 space-y-3">
            <Link href="/contact/" className="btn-ink w-full">Message the concierge</Link>
            <a href={`tel:${SITE.phone.replace(/[^\d+]/g, '')}`} className="btn-outline w-full">{SITE.phone}</a>
          </div>
          <p className="mt-5 border-t border-ink/8 pt-4 text-xs text-stone">
            Supplier? <Link href="/supplier/register/" className="text-moss underline underline-offset-4">List your spa</Link> — approvals within one business day.
          </p>
        </aside>
      </section>
    </>
  );
}
