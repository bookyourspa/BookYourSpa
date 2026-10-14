'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError, type Slot } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { money, addDays, durationLabel, cn } from '@/lib/format';
import { Field, Spinner, useToast } from './ui';

type Item = { slug: string; name: string; durationMin?: number; duration?: number; price: number };
type Props = {
  spaSlug: string;
  treatments: Item[];
  packages: Item[];
  initialDate?: string;
};

type Availability = { slots: Slot[]; durationMin: number; itemName: string; price: number; dayHours: { open: string; close: string; closed: boolean } | null };

export function BookingWidget({ spaSlug, treatments, packages, initialDate }: Props) {
  const { user, loading: authLoading } = useAuth();
  const toast = useToast();
  const [itemType, setItemType] = useState<'treatment' | 'package'>('treatment');
  const list: Item[] = itemType === 'treatment' ? treatments : packages;
  const [itemSlug, setItemSlug] = useState(list[0]?.slug ?? '');
  const [date, setDate] = useState(initialDate && initialDate >= addDays(1) ? initialDate : addDays(5));
  const [avail, setAvail] = useState<Availability | null>(null);
  const [loadingAvail, setLoadingAvail] = useState(true);
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  const [guestName, setGuestName] = useState('');
  const [promo, setPromo] = useState('');
  const [stage, setStage] = useState<'browse' | 'details' | 'pay' | 'done'>('browse');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ code: string; total: number; date: string; time: string; itemName: string } | null>(null);

  const item = useMemo(() => list.find((i) => i.slug === itemSlug) ?? list[0], [list, itemSlug]);
  const price = item?.price ?? 0;

  const loadAvailability = useCallback(async () => {
    if (!item) return;
    setLoadingAvail(true);
    setTime('');
    try {
      const data = await api<Availability>(
        `/api/availability?spa=${encodeURIComponent(spaSlug)}&date=${date}&itemType=${itemType}&itemSlug=${encodeURIComponent(item.slug)}`
      );
      setAvail(data);
    } catch (e) {
      setAvail({ slots: [], durationMin: 0, itemName: '', price: 0, dayHours: null });
      if (e instanceof ApiError) setError(e.message);
    } finally {
      setLoadingAvail(false);
    }
  }, [spaSlug, date, itemType, item]);

  useEffect(() => { void loadAvailability(); }, [loadAvailability]);

  const createAndPay = async () => {
    if (!user) return;
    setBusy(true); setError(null);
    try {
      const created = await api<{ booking: { code: string; total: number; date: string; startTime: string; itemName: string }; paymentMode: string }>('/api/bookings', {
        method: 'POST',
        body: {
          spaSlug, itemType, itemSlug: item!.slug, date, time,
          notes: notes || undefined, guestName: guestName || undefined,
          promoCode: promo || undefined,
        },
      });
      const paid = await api<{ paid?: boolean; checkoutUrl?: string; alreadyPaid?: boolean }>(`/api/bookings/${created.booking.code}/pay`, {
        method: 'POST',
        body: { cardNumber: '4242 4242 4242 4242' },
      });
      if (paid.checkoutUrl) { window.location.href = paid.checkoutUrl; return; }
      setConfirmation({ code: created.booking.code, total: created.booking.total, date, time, itemName: created.booking.itemName });
      setStage('done');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Booking failed — please try again.');
    } finally {
      setBusy(false);
    }
  };

  const free = avail?.slots.filter((s) => s.available) ?? [];
  const grouped = useMemo(() => {
    const buckets: { label: string; slots: Slot[] }[] = [
      { label: 'Morning', slots: [] }, { label: 'Afternoon', slots: [] }, { label: 'Evening', slots: [] },
    ];
    for (const s of avail?.slots ?? []) {
      const h = Number(s.time.slice(0, 2));
      buckets[h < 12 ? 0 : h < 17 ? 1 : 2].slots.push(s);
    }
    return buckets.filter((b) => b.slots.length);
  }, [avail]);

  if (stage === 'done' && confirmation) {
    return (
      <div className="card-lux p-7 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sage/25 text-2xl text-moss" aria-hidden>✓</span>
        <h3 className="mt-4 font-display text-3xl">Your ritual is reserved</h3>
        <p className="mt-2 text-sm text-stone">
          Booking code <strong className="text-ink">{confirmation.code}</strong> — a confirmation is on its way to your inbox
          and will appear in your dashboard. The spa confirms shortly.
        </p>
        <dl className="mx-auto mt-6 grid max-w-xs gap-2 text-sm">
          <div className="flex justify-between"><dt className="text-stone">Treatment</dt><dd>{confirmation.itemName}</dd></div>
          <div className="flex justify-between"><dt className="text-stone">When</dt><dd>{confirmation.date} · {confirmation.time}</dd></div>
          <div className="flex justify-between"><dt className="text-stone">Paid</dt><dd className="font-medium">{money(confirmation.total)}</dd></div>
        </dl>
        <a href="/login/" className="btn-ink mt-6">View in my dashboard</a>
      </div>
    );
  }

  return (
    <div className="card-lux p-6" aria-label="Book this treatment">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-2xl">Book your visit</h3>
        <p className="text-sm"><span className="text-stone">from </span><span className="font-medium">{money(price)}</span></p>
      </div>

      <div className="mt-4 flex rounded-full bg-sand p-1 text-sm" role="tablist" aria-label="Booking type">
        {(['treatment', 'package'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={itemType === t}
            onClick={() => { setItemType(t); setItemSlug((t === 'treatment' ? treatments : packages)[0]?.slug ?? ''); }}
            className={cn('flex-1 rounded-full px-4 py-2 capitalize transition-colors',
              itemType === t ? 'bg-ink text-champagne' : 'text-stone hover:text-ink')}>
            {t === 'treatment' ? 'Treatments' : 'Packages'}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-4">
        <Field label="Choose your experience">
          <select value={itemSlug} onChange={(e) => setItemSlug(e.target.value)} className="input-lux">
            {list.map((i) => (
              <option key={i.slug} value={i.slug}>
                {i.name} · {durationLabel(i.durationMin ?? i.duration ?? 60)} · {money(i.price)}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Date">
          <input type="date" value={date} min={addDays(1)} max={addDays(120)} onChange={(e) => setDate(e.target.value)} className="input-lux" />
        </Field>

        <div>
          <span className="label-lux">Available times {avail?.dayHours && !avail.dayHours.closed && <span className="normal-case tracking-normal text-sage">({avail.dayHours.open}–{avail.dayHours.close})</span>}</span>
          {loadingAvail ? (
            <div className="rounded-xl border border-ink/10 bg-white/60 px-4 py-6"><Spinner label="Checking live availability…" /></div>
          ) : free.length === 0 ? (
            <p className="rounded-xl border border-ink/10 bg-white/60 px-4 py-4 text-sm text-stone">
              No times left on this date — try another day, the spa releases new slots daily.
            </p>
          ) : (
            <div className="space-y-3">
              {grouped.map((b) => (
                <div key={b.label}>
                  <p className="mb-1.5 text-[0.68rem] uppercase tracking-[0.2em] text-stone">{b.label}</p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {b.slots.map((s) => (
                      <button key={s.time} disabled={!s.available} onClick={() => setTime(s.time)}
                        className={cn('rounded-lg border px-2 py-2 text-sm transition-all',
                          time === s.time ? 'border-gold bg-gold/15 font-medium text-[#8a6d2f]'
                            : s.available ? 'border-ink/12 bg-white hover:border-gold/70'
                            : 'cursor-not-allowed border-ink/8 bg-sand/60 text-stone/50 line-through')}>
                        {s.time}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {stage === 'browse' && time && (
          <button className="btn-ink w-full" onClick={() => setStage('details')}>Continue with {time}</button>
        )}

        {stage !== 'browse' && (
          <>
            <Field label="Promo code (optional)">
              <input value={promo} onChange={(e) => setPromo(e.target.value.toUpperCase())} placeholder="WELCOME15" className="input-lux uppercase" />
            </Field>
            <Field label="Anything the spa should know?">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={500} className="input-lux" placeholder="Pressure preferences, celebrations, accessibility…" />
            </Field>
          </>
        )}

        {stage === 'pay' && (
          <>
            <div className="rounded-xl border border-gold/40 bg-gold/8 p-4 text-sm">
              <p className="flex items-center justify-between"><span className="text-stone">{item?.name}</span><span>{money(price)}</span></p>
              {promo && <p className="mt-1 flex items-center justify-between text-moss"><span>Code {promo}</span><span>applied at confirmation</span></p>}
              <p className="mt-2 flex items-center justify-between border-t border-gold/30 pt-2 font-medium"><span>Total today</span><span>{money(price)}</span></p>
              <p className="mt-2 text-xs text-stone">
                Secure demo checkout (Stripe activates automatically once live keys are added). Cancel free up to 24h before.
              </p>
            </div>
            <p className="text-xs text-stone">You are signed in as <strong>{user?.email}</strong>.</p>
            <button className="btn-gold w-full" onClick={createAndPay} disabled={busy}>
              {busy ? 'Confirming payment…' : `Pay ${money(price)} & reserve`}
            </button>
          </>
        )}

        {stage === 'details' && (
          <button className="btn-ink w-full" onClick={() => setStage('pay')}>Continue to payment</button>
        )}

        {!user && !authLoading && (
          <p className="text-center text-xs text-stone">
            <a href="/login/" className="text-moss underline underline-offset-4">Sign in</a> or{' '}
            <a href="/register/" className="text-moss underline underline-offset-4">create an account</a> to complete your booking.
          </p>
        )}
        {error && <p className="rounded-lg bg-red-900/8 px-4 py-3 text-sm text-red-900">{error}</p>}
        {toast.node}
      </div>
    </div>
  );
}
