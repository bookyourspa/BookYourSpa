'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth, useRoleGuard } from '@/lib/auth';
import { cn, prettyDateTime, initials } from '@/lib/format';
import { Logo } from '@/components/Logo';
import { Spinner } from '@/components/ui';

export type AdminTab =
  | 'overview' | 'bookings' | 'customers' | 'suppliers' | 'spas'
  | 'payments' | 'commissions' | 'reviews' | 'messages' | 'content' | 'settings' | 'emails';

export const ADMIN_NAV: { id: AdminTab; label: string; icon: string; badgeKey?: string }[] = [
  { id: 'overview', label: 'Overview', icon: '◈' },
  { id: 'bookings', label: 'Bookings', icon: '🗓' },
  { id: 'customers', label: 'Customers', icon: '◎' },
  { id: 'suppliers', label: 'Suppliers', icon: '⌂', badgeKey: 'pending_suppliers' },
  { id: 'spas', label: 'Spa listings', icon: '❖', badgeKey: 'pending_spas' },
  { id: 'payments', label: 'Payments', icon: '⬡' },
  { id: 'commissions', label: 'Commissions', icon: '◇' },
  { id: 'reviews', label: 'Reviews', icon: '★', badgeKey: 'pending_reviews' },
  { id: 'messages', label: 'Messages', icon: '✉', badgeKey: 'new_messages' },
  { id: 'content', label: 'Content', icon: '✎' },
  { id: 'settings', label: 'SEO & settings', icon: '⚙' },
  { id: 'emails', label: 'Email log', icon: '✉' },
];

export function AdminShell({ children, tab, setTab, badges }: {
  children: React.ReactNode;
  tab: AdminTab;
  setTab: (t: AdminTab) => void;
  badges: Record<string, number>;
}) {
  const { allowed, loading } = useRoleGuard('admin');
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  if (loading || !allowed) {
    return <div className="flex min-h-screen items-center justify-center"><Spinner label="Verifying admin access…" /></div>;
  }

  const nav = (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Admin sections">
      {ADMIN_NAV.map((item) => {
        const badge = item.badgeKey ? badges[item.badgeKey] ?? 0 : 0;
        return (
          <button key={item.id} onClick={() => { setTab(item.id); setOpen(false); }}
            className={cn('flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm transition-colors',
              tab === item.id ? 'bg-gold/15 text-gold-soft' : 'text-champagne/70 hover:bg-champagne/5 hover:text-champagne')}>
            <span className="w-5 text-center" aria-hidden>{item.icon}</span>
            <span className="flex-1">{item.label}</span>
            {badge > 0 && <span className="rounded-full bg-gold px-2 py-0.5 text-[0.62rem] font-semibold text-forest">{badge}</span>}
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-cream">
      <div className="flex min-h-screen">
        {/* sidebar */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-champagne/10 bg-forest lg:flex">
          <div className="border-b border-champagne/10 px-5 py-5">
            <Logo light />
            <p className="mt-3 text-[0.66rem] uppercase tracking-[0.3em] text-gold">Admin console</p>
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

        {/* mobile drawer */}
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
            <h1 className="font-display text-2xl">{ADMIN_NAV.find((n) => n.id === tab)?.label}</h1>
            <div className="flex items-center gap-3 text-sm">
              <span className="hidden text-stone sm:block">{user?.email}</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-forest text-xs text-gold">{initials(user?.name ?? 'Admin')}</span>
            </div>
          </header>
          <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </div>
  );
}

export type NotificationRow = { id: string; title: string; body: string; createdAt: string; isRead: boolean; type: string };

export async function fetchNotifications() {
  try {
    return await api<{ items: NotificationRow[]; unread: number }>('/api/me/notifications');
  } catch {
    return { items: [], unread: 0 };
  }
}
export { prettyDateTime };
