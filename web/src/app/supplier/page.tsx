'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { money, prettyDate, cn, STATUS_STYLES } from '@/lib/format';
import { Badge, EmptyState, Field, Modal, Spinner, useToast } from '@/components/ui';
import { SupplierShell, type SupplierTab } from '@/components/supplier/SupplierShell';
import { SpaManager } from '@/components/supplier/SpaManager';
import { BookingsPanel } from '@/components/supplier/BookingsPanel';
import { EarningsPanel } from '@/components/supplier/EarningsPanel';

type Overview = {
  stats: { upcoming: number; pendingRequests: number; completed: number; monthEarnings: number; monthCommission: number; totalEarnings: number };
  spas: any[];
  recent: any[];
};

export default function SupplierPage() {
  const [tab, setTab] = useState<SupplierTab>('overview');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [activeSpa, setActiveSpa] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    try { setOverview(await api<Overview>('/api/supplier/overview')); }
    catch { /* guard handles */ }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const requestCount = overview?.stats.pendingRequests ?? 0;

  useEffect(() => {
    if (overview && !activeSpa && overview.spas.length) setActiveSpa(overview.spas[0].id);
  }, [overview, activeSpa]);

  return (
    <SupplierShell tab={tab} setTab={setTab} requestCount={requestCount}>
      {tab === 'overview' && overview && <OverviewPanel data={overview} onOpenSpa={(id) => { setActiveSpa(id); setTab('catalog'); }} onRefresh={load} />}
      {tab === 'overview' && !overview && <div className="py-24 text-center"><Spinner label="Loading your studio…" /></div>}
      {tab === 'spas' && <SpaManager onChanged={load} />}
      {tab === 'catalog' && overview && (
        <SpaPicker spas={overview.spas} active={activeSpa} onChange={setActiveSpa}>
          {activeSpa && <SpaManager spaId={activeSpa} mode="catalog" onChanged={load} />}
        </SpaPicker>
      )}
      {tab === 'bookings' && <BookingsPanel onChanged={load} />}
      {tab === 'earnings' && <EarningsPanel />}
      {toast.node}
    </SupplierShell>
  );
}

function SpaPicker({ spas, active, onChange, children }: { spas: any[]; active: string | null; onChange: (id: string) => void; children: React.ReactNode }) {
  if (!spas.length) return <EmptyState title="No listings yet" body="Create your first listing from the My listings tab." />;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {spas.map((s) => (
          <button key={s.id} onClick={() => onChange(s.id)}
            className={cn('badge border px-4 py-1.5', active === s.id ? 'border-gold bg-gold/15 text-[#8a6d2f]' : 'border-ink/15 text-stone hover:border-gold/60')}>
            {s.name}
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}

function OverviewPanel({ data, onOpenSpa, onRefresh }: { data: Overview; onOpenSpa: (id: string) => void; onRefresh: () => Promise<void> }) {
  const toast = useToast();
  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[
          { label: 'Awaiting your confirmation', value: data.stats.pendingRequests, tone: 'gold' as const },
          { label: 'Upcoming appointments', value: data.stats.upcoming, tone: undefined },
          { label: 'Completed treatments', value: data.stats.completed, tone: undefined },
          { label: 'Earnings this month', value: money(data.stats.monthEarnings), tone: 'sage' as const },
          { label: 'Commission this month', value: money(data.stats.monthCommission), tone: undefined },
          { label: 'Lifetime earnings', value: money(data.stats.totalEarnings), tone: undefined },
        ].map((s) => (
          <div key={s.label} className="card-lux p-5">
            <p className="text-[0.66rem] uppercase tracking-[0.22em] text-stone">{s.label}</p>
            <p className={cn('mt-2 font-display text-4xl', s.tone === 'gold' ? 'text-[#8a6d2f]' : s.tone === 'sage' ? 'text-moss' : 'text-ink')}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card-lux p-6" aria-labelledby="my-spas-heading">
          <div className="flex items-center justify-between">
            <h2 id="my-spas-heading" className="font-display text-2xl">Your listings</h2>
            <button onClick={() => void onRefresh()} className="text-xs text-moss hover:underline">Refresh</button>
          </div>
          <div className="mt-4 space-y-3">
            {data.spas.map((s) => (
              <div key={s.id} className="flex items-center gap-4 rounded-xl border border-ink/8 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.image} alt={s.name} width={96} height={72} loading="lazy" className="h-14 w-20 rounded-lg object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-lg">{s.name}</p>
                  <p className="text-xs text-stone">{s.city} · ★ {Number(s.rating).toFixed(1)} · {s.counts.treatments} treatments · {s.counts.packages} packages</p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span className={cn('badge', s.status === 'approved' ? 'bg-sage/20 text-moss' : s.status === 'pending' ? 'bg-gold/15 text-[#8a6d2f]' : 'bg-red-900/10 text-red-900/80')}>{s.status}</span>
                  <button onClick={() => onOpenSpa(s.id)} className="text-xs text-moss hover:underline">Manage →</button>
                </div>
              </div>
            ))}
            {data.spas.length === 0 && <p className="py-6 text-center text-sm text-stone">No listings yet — create one to go live.</p>}
          </div>
        </section>

        <section className="card-lux p-6" aria-labelledby="recent-req-heading">
          <h2 id="recent-req-heading" className="font-display text-2xl">Latest booking requests</h2>
          <div className="mt-4 space-y-3">
            {data.recent.length === 0 && <p className="py-6 text-center text-sm text-stone">No booking requests yet — they will appear here the moment guests reserve.</p>}
            {data.recent.slice(0, 6).map((b: any) => (
              <div key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-ink/8 px-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate">{b.item_name}</p>
                  <p className="text-xs text-stone">{b.booking_date} {b.start_time} · {b.spa_name}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-sm font-medium">{money(b.total)}</span>
                  <span className={cn('badge', STATUS_STYLES[b.status] ?? '')}>{b.status}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
      {toast.node}
    </div>
  );
}
