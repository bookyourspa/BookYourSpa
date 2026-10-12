'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type Booking, STATUS_STYLES } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { money, prettyDate, prettyDateTime, durationLabel, cn, initials } from '@/lib/format';
import { Badge, EmptyState, Field, Spinner, useToast } from './ui';

type Notification = { id: string; type: string; title: string; body: string; link?: string | null; isRead: boolean; createdAt: string };
type Summary = { upcoming: number; past: number; spent: number };

const TABS = ['Bookings', 'Notifications', 'Profile'] as const;

export function CustomerDashboard() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Bookings');
  const [filter, setFilter] = useState<'upcoming' | 'past'>('upcoming');
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [notes, setNotes] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busyCode, setBusyCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [b, s, n] = await Promise.all([
        api<{ items: Booking[] }>(`/api/bookings/mine?filter=${filter}`),
        api<Summary>('/api/bookings/summary'),
        api<{ items: Notification[]; unread: number }>('/api/me/notifications'),
      ]);
      setBookings(b.items); setSummary(s); setNotes(n.items); setUnread(n.unread);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load your dashboard.');
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  const cancel = async (code: string) => {
    if (!confirm('Cancel this booking? Free cancellation applies more than 24h before the appointment.')) return;
    setBusyCode(code);
    try {
      const res = await api<{ refunded: boolean }>(`/api/bookings/${code}/cancel`, { method: 'POST', body: { reason: 'Cancelled from dashboard' } });
      toast.show(res.refunded ? 'Booking cancelled — your payment will be refunded.' : 'Booking cancelled.');
      await load();
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : 'Could not cancel this booking.', 'error');
    } finally {
      setBusyCode(null);
    }
  };

  const payNow = async (code: string) => {
    setBusyCode(code);
    try {
      const res = await api<{ checkoutUrl?: string }>(`/api/bookings/${code}/pay`, { method: 'POST', body: { cardNumber: '4242 4242 4242 4242' } });
      if (res.checkoutUrl) { window.location.href = res.checkoutUrl; return; }
      toast.show('Payment received — the spa has been notified.');
      await load();
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : 'Payment failed.', 'error');
    } finally {
      setBusyCode(null);
    }
  };

  const markAllRead = async () => {
    await api('/api/me/notifications/read', { method: 'POST', body: { all: true } });
    setNotes((n) => n.map((x) => ({ ...x, isRead: true })));
    setUnread(0);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">My account</p>
          <h1 className="mt-2 font-display text-4xl sm:text-5xl">Hello, {user?.name?.split(' ')[0]}</h1>
          <p className="mt-1 text-sm text-stone">{user?.email}</p>
        </div>
        <div className="flex gap-3">
          <Link href="/spas/" className="btn-ink !px-6 !py-2.5">Book a treatment</Link>
          <button onClick={logout} className="btn-outline !px-6 !py-2.5">Sign out</button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Upcoming rituals', value: summary ? String(summary.upcoming) : '—' },
          { label: 'Past visits', value: summary ? String(summary.past) : '—' },
          { label: 'Invested in calm', value: summary ? money(summary.spent) : '—' },
        ].map((s) => (
          <div key={s.label} className="card-lux p-6">
            <p className="text-[0.7rem] uppercase tracking-[0.22em] text-stone">{s.label}</p>
            <p className="mt-2 font-display text-4xl text-moss">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 border-b border-ink/10">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn('relative px-4 py-3 text-sm tracking-wide transition-colors',
              tab === t ? 'text-ink' : 'text-stone hover:text-ink')}>
            {t}
            {t === 'Notifications' && unread > 0 && (
              <span className="ml-2 rounded-full bg-gold px-2 py-0.5 text-[0.65rem] text-forest">{unread}</span>
            )}
            {tab === t && <span className="absolute inset-x-3 -bottom-px h-0.5 bg-gold" />}
          </button>
        ))}
      </div>

      {error && <p className="rounded-lg bg-red-900/8 px-4 py-3 text-sm text-red-900">{error}</p>}

      {tab === 'Bookings' && (
        <div>
          <div className="mb-5 flex gap-2">
            {(['upcoming', 'past'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={cn('badge border px-4 py-1.5 capitalize', filter === f ? 'border-gold bg-gold/15 text-[#8a6d2f]' : 'border-ink/15 text-stone')}>
                {f}
              </button>
            ))}
          </div>
          {!bookings ? (
            <div className="py-16 text-center"><Spinner label="Loading your bookings…" /></div>
          ) : bookings.length === 0 ? (
            <EmptyState title={filter === 'upcoming' ? 'No upcoming rituals' : 'No past visits yet'}
              body={filter === 'upcoming' ? 'Your next sanctuary is one search away.' : 'Completed and cancelled bookings will appear here.'}
              action={filter === 'upcoming' ? <Link href="/spas/" className="btn-gold">Browse spas</Link> : undefined} />
          ) : (
            <ul className="space-y-4">
              {bookings.map((b) => (
                <li key={b.code} className="card-lux grid gap-5 p-5 sm:grid-cols-[110px_1fr_auto]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={b.spa.image} alt={b.spa.name} width={220} height={220} loading="lazy" className="h-28 w-full rounded-xl object-cover sm:w-28" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-2xl">{b.itemName}</h3>
                      <Badge tone={b.status === 'confirmed' ? 'sage' : b.status === 'pending' ? 'gold' : b.status === 'completed' ? 'sage' : 'stone'}>
                        {b.status}
                      </Badge>
                      <span className={cn('badge', STATUS_STYLES[b.paymentStatus] ?? 'bg-stone/15 text-stone')}>{b.paymentStatus}</span>
                    </div>
                    <p className="mt-1 text-sm text-stone">{b.spa.name} · {b.spa.city}</p>
                    <p className="mt-2 text-sm">
                      {prettyDate(b.date)} · {b.startTime}–{b.endTime} ({durationLabel(b.durationMin)}) · code <strong>{b.code}</strong>
                    </p>
                    {b.paymentStatus === 'unpaid' && b.status !== 'cancelled' && (
                      <p className="mt-2 rounded-lg bg-gold/10 px-3 py-2 text-sm text-[#8a6d2f]">
                        Awaiting payment — this slot is held for a limited time.
                      </p>
                    )}
                    {b.guestName && <p className="mt-1 text-xs text-stone">Guest: {b.guestName}</p>}
                  </div>
                  <div className="flex flex-col items-end justify-between gap-2">
                    <p className="font-display text-3xl text-moss">{money(b.total, b.currency)}</p>
                    <div className="flex flex-wrap justify-end gap-2">
                      {b.paymentStatus === 'unpaid' && b.status !== 'cancelled' && (
                        <button onClick={() => payNow(b.code)} disabled={busyCode === b.code} className="btn-gold !px-5 !py-2 text-xs">
                          {busyCode === b.code ? 'Paying…' : 'Complete payment'}
                        </button>
                      )}
                      {b.canCancel && (b.status === 'pending' || b.status === 'confirmed') && (
                        <button onClick={() => cancel(b.code)} disabled={busyCode === b.code} className="btn-outline !px-5 !py-2 text-xs">Cancel</button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'Notifications' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={markAllRead} className="text-sm text-moss underline-offset-4 hover:underline" disabled={unread === 0}>
              Mark all as read
            </button>
          </div>
          {notes.length === 0 ? (
            <EmptyState title="Nothing yet" body="Booking confirmations and status updates will appear here." />
          ) : (
            <ul className="divide-y divide-ink/8">
              {notes.map((n) => (
                <li key={n.id} className={cn('flex gap-4 px-2 py-4', !n.isRead && 'bg-gold/5')}>
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-moss/10 text-moss" aria-hidden>✦</span>
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-sm', !n.isRead ? 'font-medium text-ink' : 'text-stone')}>{n.title}</p>
                    <p className="mt-0.5 text-sm text-stone">{n.body}</p>
                    <p className="mt-1 text-xs text-stone/70">{prettyDateTime(n.createdAt)}</p>
                  </div>
                  {!n.isRead && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-gold" aria-label="Unread" />}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'Profile' && <ProfileForm />}
      {toast.node}
    </div>
  );
}

function ProfileForm() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [currentPassword, setCurrent] = useState('');
  const [password, setNew] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api('/api/bookings/me', {
        method: 'PATCH',
        body: { name, phone, password: password || undefined, currentPassword: currentPassword || undefined },
      });
      if (user) setUser({ ...user, name, phone });
      setCurrent(''); setNew('');
      toast.show('Profile updated.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update profile.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="card-lux max-w-xl space-y-4 p-7">
      <h2 className="font-display text-3xl">Personal details</h2>
      <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} className="input-lux" autoComplete="name" /></Field>
      <Field label="Phone"><input value={phone} onChange={(e) => setPhone(e.target.value)} className="input-lux" autoComplete="tel" /></Field>
      <div className="grid gap-4 pt-2 sm:grid-cols-2">
        <Field label="Current password" hint="Required only to change password">
          <input value={currentPassword} onChange={(e) => setCurrent(e.target.value)} type="password" className="input-lux" autoComplete="current-password" />
        </Field>
        <Field label="New password" hint="8+ characters, letters and numbers">
          <input value={password} onChange={(e) => setNew(e.target.value)} type="password" className="input-lux" autoComplete="new-password" />
        </Field>
      </div>
      {error && <p className="rounded-lg bg-red-900/8 px-4 py-3 text-sm text-red-900">{error}</p>}
      <button className="btn-ink" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
      {toast.node}
    </form>
  );
}
