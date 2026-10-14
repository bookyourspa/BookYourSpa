import Link from 'next/link';
import { SITE, DESTINATIONS, CATEGORIES } from '@/lib/content';
import { Logo } from './Logo';

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="bg-forest text-champagne/85">
      <div className="container-site grid gap-12 py-16 md:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-5">
          <Logo light />
          <p className="max-w-xs text-sm leading-relaxed text-champagne/70">
            A curated marketplace of the world’s finest spas, bathhouses and wellness houses — booked in under sixty seconds.
          </p>
          <div className="flex gap-3 text-sm">
            {Object.entries(SITE.social).map(([name, href]) => (
              <a key={name} href={href} rel="noopener noreferrer nofollow" target="_blank"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-champagne/20 capitalize transition-colors hover:border-gold hover:text-gold"
                aria-label={name}>
                {name[0].toUpperCase()}
              </a>
            ))}
          </div>
        </div>

        <nav aria-label="Explore">
          <h3 className="eyebrow mb-4">Explore</h3>
          <ul className="space-y-2.5 text-sm">
            <li><Link href="/spas/" className="hover:text-gold">All spas</Link></li>
            <li><Link href="/treatments/" className="hover:text-gold">Massage treatments</Link></li>
            <li><Link href="/packages/" className="hover:text-gold">Spa packages</Link></li>
            <li><Link href="/offers/" className="hover:text-gold">Special offers</Link></li>
            <li><Link href="/destinations/" className="hover:text-gold">Destinations</Link></li>
            <li><Link href="/faq/" className="hover:text-gold">FAQs</Link></li>
          </ul>
        </nav>

        <nav aria-label="Popular destinations">
          <h3 className="eyebrow mb-4">Popular destinations</h3>
          <ul className="space-y-2.5 text-sm">
            {DESTINATIONS.slice(0, 6).map((d) => (
              <li key={d.slug}><Link href={`/destinations/${d.slug}/`} className="hover:text-gold">{d.name} spas</Link></li>
            ))}
            {CATEGORIES.slice(0, 2).map((c) => (
              <li key={c.slug}><Link href={`/treatments/?category=${c.slug}`} className="hover:text-gold">{c.name}</Link></li>
            ))}
          </ul>
        </nav>

        <div>
          <h3 className="eyebrow mb-4">Concierge</h3>
          <ul className="space-y-2.5 text-sm">
            <li><a href={`mailto:${SITE.email}`} className="hover:text-gold">{SITE.email}</a></li>
            <li><a href={`tel:${SITE.phone.replace(/[^\d+]/g, '')}`} className="hover:text-gold">{SITE.phone}</a></li>
            <li className="pt-1 text-champagne/60">{SITE.address}</li>
            <li className="pt-2"><Link href="/supplier/register/" className="text-gold hover:underline">List your spa on BookYourSpa</Link></li>
            <li><Link href="/contact/" className="hover:text-gold">Contact & support</Link></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-champagne/10">
        <div className="container-site flex flex-col items-center justify-between gap-4 py-6 text-xs text-champagne/60 sm:flex-row">
          <p>© {year} {SITE.name} Ltd. All rights reserved.</p>
          <p className="flex items-center gap-4">
            <span>Secure payments by Stripe</span>
            <span aria-hidden>·</span>
            <span>Privacy</span>
            <span aria-hidden>·</span>
            <span>Terms</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
