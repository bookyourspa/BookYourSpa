'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Logo } from './Logo';
import { cn } from '@/lib/format';

const LINKS = [
  { href: '/spas/', label: 'Spas' },
  { href: '/treatments/', label: 'Treatments' },
  { href: '/packages/', label: 'Packages' },
  { href: '/offers/', label: 'Offers' },
  { href: '/destinations/', label: 'Destinations' },
  { href: '/faq/', label: 'FAQ' },
  { href: '/contact/', label: 'Contact' },
];

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const isHome = pathname === '/';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  const overlay = isHome && !scrolled && !open;
  const dashHref = user?.role === 'admin' ? '/admin' : user?.role === 'supplier' ? '/supplier' : '/login';

  return (
    <header className={cn('fixed inset-x-0 top-0 z-50 transition-all duration-500',
      overlay ? 'bg-transparent' : 'border-b border-ink/8 bg-cream/95 backdrop-blur-md')}>
      <div className={cn('hidden items-center justify-center gap-3 py-2 text-[0.72rem] uppercase tracking-[0.28em] lg:flex',
        overlay ? 'text-champagne/80' : 'bg-forest text-champagne/80')}>
        <span aria-hidden>✦</span> Complimentary welcome ritual on your first booking — code WELCOME15
      </div>
      <div className="container-site flex items-center justify-between py-4">
        <Logo light={overlay} />
        <nav className="hidden items-center gap-7 xl:flex" aria-label="Primary">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href}
              className={cn('text-sm tracking-wide transition-colors hover:text-gold',
                overlay ? 'text-champagne' : 'text-ink/80')}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          {user ? (
            <div className="hidden items-center gap-3 sm:flex">
              <Link href={dashHref} className={cn('text-sm tracking-wide transition-colors hover:text-gold', overlay ? 'text-champagne' : 'text-ink/80')}>
                {user.name.split(' ')[0]}’s dashboard
              </Link>
              <button onClick={async () => { await logout(); router.push('/'); }} className={cn('text-sm underline-offset-4 hover:underline', overlay ? 'text-champagne/70' : 'text-stone')}>Sign out</button>
            </div>
          ) : (
            <Link href="/login/" className={cn('hidden text-sm tracking-wide transition-colors hover:text-gold sm:block', overlay ? 'text-champagne' : 'text-ink/80')}>
              Sign in
            </Link>
          )}
          <Link href={user?.role === 'customer' || !user ? '/spas/' : dashHref} className="btn-gold hidden !px-6 !py-2.5 sm:inline-flex">
            Book Now
          </Link>
          <button
            onClick={() => setOpen((v) => !v)}
            className={cn('inline-flex h-10 w-10 items-center justify-center rounded-full border xl:hidden',
              overlay ? 'border-champagne/40 text-champagne' : 'border-ink/15 text-ink')}
            aria-label="Toggle menu" aria-expanded={open}
          >
            <span className="text-lg" aria-hidden>{open ? '✕' : '☰'}</span>
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-ink/8 bg-cream xl:hidden">
          <nav className="container-site grid gap-1 py-4" aria-label="Mobile">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="rounded-lg px-3 py-2.5 text-sm tracking-wide hover:bg-sand">{l.label}</Link>
            ))}
            <div className="my-2 h-px bg-ink/10" />
            {user ? (
              <>
                <Link href={dashHref} className="rounded-lg px-3 py-2.5 text-sm hover:bg-sand">My dashboard</Link>
                <button onClick={async () => { await logout(); router.push('/'); }} className="rounded-lg px-3 py-2.5 text-left text-sm text-stone hover:bg-sand">Sign out</button>
              </>
            ) : (
              <>
                <Link href="/login/" className="rounded-lg px-3 py-2.5 text-sm hover:bg-sand">Sign in</Link>
                <Link href="/register/" className="rounded-lg px-3 py-2.5 text-sm hover:bg-sand">Create account</Link>
                <Link href="/supplier/register/" className="rounded-lg px-3 py-2.5 text-sm hover:bg-sand">List your spa</Link>
              </>
            )}
            <Link href="/spas/" className="btn-gold mt-2">Book Now</Link>
          </nav>
        </div>
      )}
    </header>
  );
}
