import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE } from '@/lib/content';
import { ContactForm } from '@/components/ContactForm';
import { JsonLd } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Contact & Support',
  description: 'Reach the BookYourSpa concierge: booking help, cancellations, group bookings, gift vouchers and supplier enquiries.',
  alternates: { canonical: '/contact/' },
};

export default function ContactPage() {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'ContactPage',
    mainEntity: {
      '@type': 'Organization',
      name: SITE.name,
      telephone: SITE.phone,
      email: SITE.email,
      address: { '@type': 'PostalAddress', streetAddress: SITE.address },
    },
  };
  return (
    <>
      <JsonLd data={ld} />
      <section className="bg-forest pb-14 pt-40 text-champagne">
        <div className="container-site">
          <p className="eyebrow">Concierge</p>
          <h1 className="mt-3 font-display text-5xl text-cream sm:text-6xl">Contact us</h1>
          <p className="mt-3 max-w-2xl text-champagne/75">Booking help, cancellations, group reservations or listing your spa — we reply within one business hour.</p>
        </div>
      </section>
      <section className="container-site grid gap-10 py-14 lg:grid-cols-[1.1fr_0.9fr]">
        <ContactForm />
        <div className="space-y-6">
          <div className="card-lux p-7">
            <h2 className="font-display text-3xl">Direct lines</h2>
            <ul className="mt-4 space-y-3 text-sm">
              <li className="flex items-center justify-between border-b border-ink/8 pb-3">
                <span className="text-stone">Guest support</span>
                <a href={`tel:${SITE.phone.replace(/[^\d+]/g, '')}`} className="font-medium hover:text-gold">{SITE.phone}</a>
              </li>
              <li className="flex items-center justify-between border-b border-ink/8 pb-3">
                <span className="text-stone">Email</span>
                <a href={`mailto:${SITE.email}`} className="font-medium hover:text-gold">{SITE.email}</a>
              </li>
              <li className="flex items-center justify-between border-b border-ink/8 pb-3">
                <span className="text-stone">Suppliers</span>
                <a href={`mailto:${SITE.supportEmail}`} className="font-medium hover:text-gold">{SITE.supportEmail}</a>
              </li>
              <li className="pt-2 text-stone">{SITE.address}</li>
            </ul>
            <p className="mt-4 text-xs text-stone">Concierge hours: 08:00–22:00 CET, seven days a week.</p>
          </div>
          <div className="card-lux p-7">
            <h2 className="font-display text-3xl">List your spa</h2>
            <p className="mt-3 text-sm leading-relaxed text-stone">
              Join a collection of {new Date().getFullYear() > 0 ? 'independent luxury houses' : ''} reaching guests in {8} destinations.
              Registration takes two minutes; approval takes one business day.
            </p>
            <Link href="/supplier/register/" className="btn-ink mt-5 w-full">Become a supplier</Link>
          </div>
        </div>
      </section>
    </>
  );
}
