'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useAuth, useRoleGuard } from '@/lib/auth';
import { cn, initials } from '@/lib/format';
import { Logo } from '@/components/Logo';
import { Spinner } from '@/components/ui';

export type SupplierTab = 'overview' | 'spas' | 'catalog' | 'bookings' | 'earnings';

export const SUPPLIER_NAV: { id: SupplierTab; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: '◈' },
  { id: 'spas', label: 'My listings', icon: '❖' },
  { id: 'catalog', label: 'Treatments & hours', icon: '✎' },
  { id: 'bookings', label: 'Booking requests', icon: '🗓' },
  { id: 'earnings', label: 'Earnings', icon: '⬡' },
];

export function SupplierShell({ children, tab, setTab, requestCount }: {
  children: React.ReactNode;
  tab: SupplierTab;
  setTab: (t: SupplierTab) => void;
  requestCount: number;
}) {
  const { allowed, loading } = useRoleGuard('supplier');
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  if (loading || !allowed) {
    return <div className="flex min-h-screen items-center justify-center"><Spinner label="Verifying supplier access…" /></div>;
  }
  if (user?.supplier_status === 'pending') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream p-6">
        <div className="card-lux max-w-md p-8 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gold/15 text-2xl text-[#8a6d2f]" aria-hidden>⧗</span>
          <h1 className="mt-4 font-display text-3xl">Registration under review</h1>
          <p className="mt-3 text-sm leading-relaxed text-stone">
            Thank you, {user?.name?.split(' ')[0]}. Our team reviews supplier applications within one business day —
            your dashboard unlocks the moment it is approved, and we will email you either way.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/" className="btn-outline !px-5 !py-2.5 text-xs">Back to the site</Link>
            <button onClick={logout} className="btn-outline !px-5 !py-2.5 text-xs">Sign out</button>
          </div>
        </div>
      </div>
    );
  }

  const nav = (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Supplier sections">
      {SUPPLIER_NAV.map((item) => (
        <button key={item.id} onClick={() => { setTab(item.id); setOpen(false); }}
          className={cn('flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm transition-colors',
            tab === item.id ? 'bg-gold/15 text-gold-soft' : 'text-champagne/70 hover:bg-champagne/5 hover:text-champagne')}>
          <span className="w-5 text-center" aria-hidden>{item.icon}</span>
          <span className="flex-1">{item.label}</span>
          {item.id === 'bookings' && requestCount > 0 && (
            <span className="rounded-full bg-gold px-2 py-0.5 text-[0.62rem] font-semibold text-forest">{requestCount}</span>
          )}
        </button>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-cream">
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-champagne/10 bg-forest lg:flex">
          <div className="border-b border-champagne/10 px-5 py-5">
            <Logo light />
            <p className="mt-3 text-[0.66rem] uppercase tracking-[0.3em] text-gold">Supplier studio</p>
          </div>
          {nav}
          <div className="border-t border-champagne/10 px-5 py-4">
            <p className="truncate text-sm text-champagne">{user?.name}</p>
            <p className="truncate text-xs text-champagne/50">{user?.email}</p>
            <div className="mt-3 flex gap-2">
              <Link href="/" className="text-xs text-gold hover:underline">View site</Link>
              <button onClick={logout} className="text-xs text-champagne/60 hover:text-champagne">Sign out</button>
            </div>
          </div>
        </aside>

        {open && (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <div className="flex w-64 flex-col bg-forest">
              <div className="border-b border-champagne/10 px-5 py-5"><Logo light /></div>
              {nav}
            </div>
            <button className="flex-1 bg-ink/50" onClick={() => setOpen(false)} aria-label="Close menu" />
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 flex items-center justify-between gap-4 border-b border-ink/8 bg-cream/95 px-4 py-3.5 backdrop-blur sm:px-6">
            <button onClick={() => setOpen(true)} className="rounded-lg border border-ink/15 px-3 py-1.5 lg:hidden" aria-label="Open menu">☰</button>
            <h1 className="font-display text-2xl">{SUPPLIER_NAV.find((n) => n.id === tab)?.label}</h1>
            <div className="flex items-center gap-3 text-sm">
              <span className="hidden text-stone sm:block">{user?.email}</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-forest text-xs text-gold">{initials(user?.name ?? 'S')}</span>
            </div>
          </header>
          <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
