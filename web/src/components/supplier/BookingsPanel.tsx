'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { money, prettyDate, cn, STATUS_STYLES } from '@/lib/format';
import { EmptyState, Modal, Spinner, useToast } from '@/components/ui';

export function BookingsPanel({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();
  const [status, setStatus] = useState('all');
  const [items, setItems] = useState<any[] | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setItems(null);
    try {
      const qs = status === 'all' ? '' : `?status=${status}`;
      setItems((await api<{ items: any[] }>(`/api/supplier/bookings${qs}`)).items);
    } catch (e) { toast.show(e instanceof ApiError ? e.message : 'Failed to load bookings', 'error'); setItems([]); }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  const update = async (code: string, next: string) => {
    const destructive = next === 'rejected' || next === 'cancelled';
    if (destructive && !confirm(`Mark ${code} as ${next}? A paid booking will be refunded automatically.`)) return;
    setBusy(code);
    try {
      await api(`/api/supplier/bookings/${code}`, { method: 'PATCH', body: { status: next, reason: `${next} by spa` } });
      toast.show(`Booking ${code} → ${next}`);
      setDetail(null);
      await load();
      onChanged();
    } catch (e) { toast.show(e instanceof ApiError ? e.message : 'Update failed', 'error'); }
    finally { setBusy(null); }
  };

  const nextActions = (b: any) => {
    const map: Record<string, { label: string; to: string }[]> = {
      pending: [{ label: 'Confirm', to: 'confirmed' }, { label: 'Decline & refund', to: 'rejected' }],
      confirmed: [{ label: 'Mark completed', to: 'completed' }, { label: 'Cancel & refund', to: 'cancelled' }],
      rejected: [],
      cancelled: [],
      completed: [],
    };
    return map[b.status] ?? [];
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input-lux max-w-[200px]">
          <option value="all">All bookings</option>
          <option value="pending">Awaiting confirmation</option>
          <option value="confirmed">Confirmed</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="rejected">Rejected</option>
        </select>
        <span className="text-sm text-stone">{items ? `${items.length} bookings` : 'Loading…'}</span>
      </div>

      {!items ? <Spinner label="Loading bookings…" /> : items.length === 0 ? (
        <EmptyState title="No bookings in this view" body="Requests appear the moment a guest completes payment." />
      ) : (
        <div className="space-y-3">
          {items.map((b) => (
            <article key={b.code} className="card-lux grid gap-4 p-5 lg:grid-cols-[1.4fr_1fr_auto] lg:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-xl">{b.item_name}</h3>
                  <span className={cn('badge', STATUS_STYLES[b.status] ?? '')}>{b.status}</span>
                  <span className={cn('badge', STATUS_STYLES[b.payment_status] ?? '')}>{b.payment_status}</span>
                </div>
                <p className="mt-1 text-sm text-stone">{b.spa_name} · code <span className="font-mono">{b.code}</span></p>
                <p className="text-xs text-stone">Booked {b.created_at?.slice(0, 10)}{b.promo_code && ` · promo ${b.promo_code}`}{b.notes && ` · “${b.notes}”`}</p>
              </div>
              <div className="text-sm">
                <p className="font-medium">{prettyDate(b.booking_date)} · {b.start_time}–{b.end_time}</p>
                <p className="text-xs text-stone">Guest: {b.customer_name} · {b.customer_email}{b.customer_phone && ` · ${b.customer_phone}`}</p>
                <p className="mt-1">{money(b.total)} <span className="text-xs text-stone">(you keep <span className="text-moss">{money(b.supplier_earning)}</span>)</span></p>
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                <button onClick={() => setDetail(b)} className="badge border border-ink/15 text-stone hover:bg-ink/5">Details</button>
                {nextActions(b).map((a) => (
                  <button key={a.to} disabled={busy === b.code} onClick={() => update(b.code, a.to)}
                    className={cn('badge border px-3 py-1',
                      a.to === 'confirmed' || a.to === 'completed' ? 'border-moss/40 text-moss hover:bg-moss/10' : 'border-red-900/40 text-red-900/80 hover:bg-red-900/10')}>
                    {a.label}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `Booking ${detail.code}` : ''}>
        {detail && (
          <dl className="space-y-2 text-sm">
            {[
              ['Experience', detail.item_name], ['Date', `${detail.booking_date} · ${detail.start_time}–${detail.end_time}`],
              ['Spa', detail.spa_name], ['Guest', `${detail.customer_name} (${detail.customer_email})`],
              detail.customer_phone ? ['Phone', detail.customer_phone] : null,
              ['Total', money(detail.total)], ['Your share', money(detail.supplier_earning)],
              ['Platform commission', money(detail.commission)], ['Payment', `${detail.payment_status} · ${detail.payment_provider ?? '—'}`],
              detail.promo_code ? ['Promo', detail.promo_code] : null,
              detail.notes ? ['Notes', detail.notes] : null,
              ['Status', detail.status],
            ].filter(Boolean).map((row: any) => (
              <div key={row[0]} className="flex justify-between gap-6 border-b border-ink/6 pb-2">
                <dt className="text-stone">{row[0]}</dt><dd className="text-right">{row[1]}</dd>
              </div>
            ))}
          </dl>
        )}
      </Modal>
      {toast.node}
    </div>
  );
}
