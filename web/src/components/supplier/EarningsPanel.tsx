'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { money, prettyDate, cn, STATUS_STYLES } from '@/lib/format';
import { EmptyState, Spinner } from '@/components/ui';

type Earnings = {
  commissionPercent: number;
  months: { month: string; bookings: number; gross: number; commission: number; net: number }[];
  upcomingPayouts: any[];
};

export function EarningsPanel() {
  const [data, setData] = useState<Earnings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Earnings>('/api/supplier/earnings').then(setData).catch((e) => setError(e?.message ?? 'Failed to load earnings'));
  }, []);

  if (error) return <p className="rounded-lg bg-red-900/8 px-4 py-3 text-sm text-red-900">{error}</p>;
  if (!data) return <div className="py-24 text-center"><Spinner label="Loading earnings…" /></div>;

  const totals = data.months.reduce((a, m) => ({ gross: a.gross + Number(m.gross), commission: a.commission + Number(m.commission), net: a.net + Number(m.net) }), { gross: 0, commission: 0, net: 0 });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card-lux p-5"><p className="text-[0.66rem] uppercase tracking-[0.22em] text-stone">Gross bookings</p><p className="mt-2 font-display text-4xl">{money(totals.gross)}</p></div>
        <div className="card-lux p-5"><p className="text-[0.66rem] uppercase tracking-[0.22em] text-stone">Platform commission ({data.commissionPercent}%)</p><p className="mt-2 font-display text-4xl text-[#8a6d2f]">−{money(totals.commission)}</p></div>
        <div className="card-lux p-5"><p className="text-[0.66rem] uppercase tracking-[0.22em] text-stone">Your net earnings</p><p className="mt-2 font-display text-4xl text-moss">{money(totals.net)}</p></div>
        <div className="card-lux p-5"><p className="text-[0.66rem] uppercase tracking-[0.22em] text-stone">Upcoming payouts</p><p className="mt-2 font-display text-4xl">{money(data.upcomingPayouts.reduce((a, b) => a + Number(b.supplier_earning), 0))}</p></div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card-lux overflow-x-auto p-6" aria-labelledby="monthly-heading">
          <h2 id="monthly-heading" className="font-display text-2xl">Monthly breakdown</h2>
          <table className="table-lux mt-4">
            <thead><tr><th>Month</th><th>Bookings</th><th>Gross</th><th>Commission</th><th>Net</th></tr></thead>
            <tbody>
              {data.months.map((m) => (
                <tr key={m.month}>
                  <td>{m.month}</td><td>{m.bookings}</td><td>{money(m.gross)}</td>
                  <td className="text-[#8a6d2f]">−{money(m.commission)}</td><td className="text-moss">{money(m.net)}</td>
                </tr>
              ))}
              {data.months.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-sm text-stone">No paid bookings yet.</td></tr>}
            </tbody>
          </table>
        </section>

        <section className="card-lux p-6" aria-labelledby="upcoming-pay-heading">
          <h2 id="upcoming-pay-heading" className="font-display text-2xl">Upcoming (paid, uncompleted)</h2>
          <div className="mt-4 space-y-3">
            {data.upcomingPayouts.length === 0 ? (
              <EmptyState title="Nothing pending" body="Paid and confirmed appointments show here until they complete." />
            ) : data.upcomingPayouts.map((b) => (
              <div key={b.code} className="flex items-center justify-between gap-3 rounded-xl border border-ink/8 px-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate">{b.item_name} · {b.spa_name}</p>
                  <p className="text-xs text-stone">{prettyDate(b.booking_date)} {b.start_time} · <span className="font-mono">{b.code}</span></p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={cn('badge', STATUS_STYLES[b.status] ?? '')}>{b.status}</span>
                  <span className="font-medium text-moss">{money(b.supplier_earning)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <p className="text-xs text-stone">
        Payouts are released after each completed appointment; commission is calculated automatically from the booking total
        at the rate configured by the platform. Questions? <a href="mailto:support@bookyourspa.net" className="text-moss underline underline-offset-4">support@bookyourspa.net</a>
      </p>
    </div>
  );
}
