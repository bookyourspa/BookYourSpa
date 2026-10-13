'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { money, prettyDate, prettyDateTime, cn } from '@/lib/format';
import { STATUS_STYLES } from '@/lib/api';
import { Badge, EmptyState, Field, Modal, Spinner, useToast } from '@/components/ui';
import { AdminShell, type AdminTab } from '@/components/admin/AdminShell';
import {
  PaymentsTab, CommissionsTab, ReviewsTab, MessagesTab, ContentTab, SettingsTab, EmailsTab,
} from '@/components/admin/AdminTabs';

type Stats = {
  counts: Record<string, number>;
  revenue: { gross: number; commission: number; supplierEarned: number; paidBookings: number };
  monthly: { month: string; bookings: number; revenue: number; commission: number }[];
  recent: any[];
};

export default function AdminPage() {
  const [tab, setTab] = useState<AdminTab>('overview');
  const [stats, setStats] = useState<Stats | null>(null);
  const toast = useToast();

  const loadStats = useCallback(async () => {
    try {
      setStats(await api<Stats>('/api/admin/stats'));
    } catch { /* guard handles auth errors */ }
  }, []);

  useEffect(() => { void loadStats(); }, [loadStats]);

  const badges = {
    pending_suppliers: stats?.counts.pending_suppliers ?? 0,
    pending_spas: stats?.counts.pending_spas ?? 0,
    pending_reviews: stats?.counts.pending_reviews ?? 0,
    new_messages: stats?.counts.new_messages ?? 0,
  };

  return (
    <AdminShell tab={tab} setTab={setTab} badges={badges}>
      {tab === 'overview' && <Overview stats={stats} onRefresh={loadStats} setTab={setTab} />}
      {tab === 'bookings' && <BookingsTab />}
      {tab === 'customers' && <CustomersTab stats={stats} onRefresh={loadStats} />}
      {tab === 'suppliers' && <SuppliersTab onRefresh={loadStats} />}
      {tab === 'spas' && <SpasTab onRefresh={loadStats} />}
      {tab === 'payments' && <PaymentsTab />}
      {tab === 'commissions' && <CommissionsTab />}
      {tab === 'reviews' && <ReviewsTab onRefresh={loadStats} />}
      {tab === 'messages' && <MessagesTab onRefresh={loadStats} />}
      {tab === 'content' && <ContentTab />}
      {tab === 'settings' && <SettingsTab />}
      {tab === 'emails' && <EmailsTab />}
      {toast.node}
    </AdminShell>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: 'gold' | 'sage' }) {
  return (
    <div className="card-lux p-5">
      <p className="text-[0.66rem] uppercase tracking-[0.22em] text-stone">{label}</p>
      <p className={cn('mt-2 font-display text-4xl', tone === 'gold' ? 'text-[#8a6d2f]' : tone === 'sage' ? 'text-moss' : 'text-ink')}>{value}</p>
      {sub && <p className="mt-1 text-xs text-stone">{sub}</p>}
    </div>
  );
}

function Overview({ stats, onRefresh, setTab }: { stats: Stats | null; onRefresh: () => Promise<void>; setTab: (t: AdminTab) => void }) {
  if (!stats) return <div className="py-24 text-center"><Spinner label="Loading platform metrics…" /></div>;
  const maxRev = Math.max(1, ...stats.monthly.map((m) => Number(m.revenue)));

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Gross revenue" value={money(stats.revenue.gross)} sub={`${stats.revenue.paidBookings} paid bookings`} tone="gold" />
        <Stat label="Platform commission" value={money(stats.revenue.commission)} sub="15% of paid bookings" tone="sage" />
        <Stat label="Supplier payouts" value={money(stats.revenue.supplierEarned)} sub="earned by partners" />
        <Stat label="Upcoming bookings" value={stats.counts.upcoming ?? 0} sub={`${stats.counts.completed ?? 0} completed all-time`} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Customers" value={stats.counts.customers ?? 0} />
        <Stat label="Spas live" value={(stats.counts.spas ?? 0) - (stats.counts.pending_spas ?? 0)} sub={`${stats.counts.pending_spas ?? 0} awaiting approval`} />
        <Stat label="Suppliers" value={stats.counts.suppliers ?? 0} sub={`${stats.counts.pending_suppliers ?? 0} pending review`} />
        <Stat label="Queue" value={(stats.counts.pending_reviews ?? 0) + (stats.counts.new_messages ?? 0)} sub={`${stats.counts.pending_reviews ?? 0} reviews · ${stats.counts.new_messages ?? 0} messages`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card-lux p-6" aria-labelledby="revenue-heading">
          <div className="flex items-center justify-between">
            <h2 id="revenue-heading" className="font-display text-2xl">Revenue, last 6 months</h2>
            <button onClick={() => void onRefresh()} className="text-xs text-moss hover:underline">Refresh</button>
          </div>
          <div className="mt-6 flex h-48 items-end gap-3">
            {stats.monthly.length === 0 ? (
              <p className="self-center text-sm text-stone">No bookings yet — the chart fills as reservations arrive.</p>
            ) : stats.monthly.map((m) => (
              <div key={m.month} className="group flex flex-1 flex-col items-center gap-2">
                <span className="text-[0.62rem] text-stone opacity-0 transition-opacity group-hover:opacity-100">{money(m.revenue)}</span>
                <div className="w-full rounded-t-lg bg-gradient-to-t from-moss to-sage transition-all group-hover:from-gold group-hover:to-gold-soft"
                  style={{ height: `${Math.max(6, (Number(m.revenue) / maxRev) * 150)}px` }} />
                <span className="text-[0.62rem] text-stone">{m.month.slice(5)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card-lux p-6" aria-labelledby="recent-heading">
          <div className="flex items-center justify-between">
            <h2 id="recent-heading" className="font-display text-2xl">Recent bookings</h2>
            <button onClick={() => setTab('bookings')} className="text-xs text-moss hover:underline">All bookings →</button>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="table-lux">
              <thead><tr><th>Code</th><th>Spa</th><th>Date</th><th>Total</th><th>Status</th></tr></thead>
              <tbody>
                {stats.recent.map((b) => (
                  <tr key={b.code}>
                    <td className="font-mono text-xs">{b.code}</td>
                    <td className="max-w-[160px] truncate">{b.spa_name}<span className="block text-xs text-stone">{b.customer_name}</span></td>
                    <td className="whitespace-nowrap text-xs">{b.booking_date} {b.start_time}</td>
                    <td>{money(b.total)}</td>
                    <td><span className={cn('badge', STATUS_STYLES[b.status] ?? '')}>{b.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ————— Bookings ————— */

const BOOKING_STATUSES = ['all', 'pending', 'confirmed', 'completed', 'cancelled', 'rejected'];

function BookingsTab() {
  const toast = useToast();
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<any[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setItems(null);
    try {
      const qs = new URLSearchParams();
      if (status !== 'all') qs.set('status', status);
      if (q) qs.set('q', q);
      const data = await api<{ items: any[] }>(`/api/admin/bookings?${qs}`);
      setItems(data.items);
    } catch (e) { toast.show(e instanceof ApiError ? e.message : 'Failed to load bookings', 'error'); setItems([]); }
  }, [status, q]);

  useEffect(() => { const t = setTimeout(() => void load(), q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);

  const setStatusFor = async (code: string, next: string) => {
    const label = next === 'cancelled' || next === 'rejected'
      ? (confirm(`Set booking ${code} to ${next}? If it was paid, it will be refunded.`) ? next : null)
      : next;
    if (!label) return;
    setBusy(code);
    try {
      await api(`/api/admin/bookings/${code}`, { method: 'PATCH', body: { status: label, reason: `Set by admin` } });
      toast.show(`Booking ${code} → ${label}`);
      await load();
    } catch (e) { toast.show(e instanceof ApiError ? e.message : 'Update failed', 'error'); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search code, guest or spa…" className="input-lux max-w-xs" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input-lux max-w-[180px]">
          {BOOKING_STATUSES.map((s) => <option key={s} value={s}>{s === 'all' ? 'All statuses' : s}</option>)}
        </select>
        <span className="text-sm text-stone">{items ? `${items.length} bookings` : 'Loading…'}</span>
      </div>

      {!items ? <Spinner label="Loading bookings…" /> : items.length === 0 ? (
        <EmptyState title="No bookings match" body="Adjust the filters or search term." />
      ) : (
        <div className="card-lux overflow-x-auto">
          <table className="table-lux">
            <thead><tr><th>Code</th><th>Guest</th><th>Experience</th><th>When</th><th>Total</th><th>Commission</th><th>Payment</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {items.map((b) => (
                <tr key={b.code}>
                  <td className="font-mono text-xs">{b.code}</td>
                  <td>{b.customer_name}<span className="block max-w-[160px] truncate text-xs text-stone">{b.customer_email}</span></td>
                  <td className="max-w-[180px] truncate">{b.item_name}<span className="block text-xs text-stone">{b.spa_name}</span></td>
                  <td className="whitespace-nowrap text-xs">{prettyDate(b.booking_date)}<span className="block text-xs text-stone">{b.start_time}</span></td>
                  <td>{money(b.total)}</td>
                  <td className="text-moss">{money(b.commission)}</td>
                  <td><span className={cn('badge', STATUS_STYLES[b.payment_status] ?? '')}>{b.payment_status}</span>{b.payment_provider && <span className="block text-[0.6rem] text-stone">{b.payment_provider}</span>}</td>
                  <td><span className={cn('badge', STATUS_STYLES[b.status] ?? '')}>{b.status}</span></td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {b.status === 'pending' && <button disabled={busy === b.code} onClick={() => setStatusFor(b.code, 'confirmed')} className="badge border border-moss/40 text-moss hover:bg-moss/10">Confirm</button>}
                      {b.status === 'confirmed' && <button disabled={busy === b.code} onClick={() => setStatusFor(b.code, 'completed')} className="badge border border-moss/40 text-moss hover:bg-moss/10">Complete</button>}
                      {['pending', 'confirmed'].includes(b.status) && (
                        <button disabled={busy === b.code} onClick={() => setStatusFor(b.code, 'cancelled')} className="badge border border-red-900/40 text-red-900/80 hover:bg-red-900/10">Cancel</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {toast.node}
    </div>
  );
}

/* ————— Customers ————— */

function CustomersTab({ stats, onRefresh }: { stats: Stats | null; onRefresh: () => Promise<void> }) {
  const toast = useToast();
  const [role, setRole] = useState('all');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<any[] | null>(null);

  const load = useCallback(async () => {
    setItems(null);
    try {
      const qs = new URLSearchParams();
      if (role !== 'all') qs.set('role', role);
      if (q) qs.set('q', q);
      setItems((await api<{ items: any[] }>(`/api/admin/users?${qs}`)).items);
    } catch (e) { toast.show(e instanceof ApiError ? e.message : 'Failed to load users', 'error'); setItems([]); }
  }, [role, q]);

  useEffect(() => { const t = setTimeout(() => void load(), q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);
  useEffect(() => { void onRefresh(); }, [onRefresh]);

  const patch = async (id: string, body: Record<string, unknown>, label: string) => {
    try {
      await api(`/api/admin/users/${id}`, { method: 'PATCH', body });
      toast.show(label);
      await load();
    } catch (e) { toast.show(e instanceof ApiError ? e.message : 'Update failed', 'error'); }
  };

  const remove = async (id: string, name: string) => {
    if (!confirm(`Permanently delete ${name}? Their bookings remain in the ledger.`)) return;
    try {
      await api(`/api/admin/users/${id}`, { method: 'DELETE' });
      toast.show('Account deleted');
      await load();
    } catch (e) { toast.show(e instanceof ApiError ? e.message : 'Delete failed', 'error'); }
  };

  void stats;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email…" className="input-lux max-w-xs" />
        <select value={role} onChange={(e) => setRole(e.target.value)} className="input-lux max-w-[180px]">
          <option value="all">All roles</option><option value="customer">Customers</option>
          <option value="supplier">Suppliers</option><option value="admin">Admins</option>
        </select>
        <span className="text-sm text-stone">{items ? `${items.length} accounts` : 'Loading…'}</span>
      </div>
      {!items ? <Spinner label="Loading accounts…" /> : (
        <div className="card-lux overflow-x-auto">
          <table className="table-lux">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Bookings</th><th>Joined</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td className="max-w-[220px] truncate text-xs">{u.email}{u.company_name && <span className="block text-xs text-stone">{u.company_name} · {u.supplier_status}</span>}</td>
                  <td><span className="badge bg-moss/10 text-moss">{u.role}</span></td>
                  <td>{u.booking_count}</td>
                  <td className="text-xs text-stone">{u.created_at?.slice(0, 10)}</td>
                  <td><span className={cn('badge', u.status === 'active' ? 'bg-sage/20 text-moss' : 'bg-red-900/10 text-red-900/80')}>{u.status}</span></td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {u.status === 'active'
                        ? <button onClick={() => patch(u.id, { status: 'suspended' }, 'Account suspended')} className="badge border border-red-900/40 text-red-900/80 hover:bg-red-900/10">Suspend</button>
                        : <button onClick={() => patch(u.id, { status: 'active' }, 'Account reactivated')} className="badge border border-moss/40 text-moss hover:bg-moss/10">Reactivate</button>}
                      <button onClick={() => remove(u.id, u.name)} className="badge border border-ink/15 text-stone hover:bg-ink/5">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {toast.node}
    </div>
  );
}

/* ————— Suppliers (approval queue) ————— */

function SuppliersTab({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const toast = useToast();
  const [status, setStatus] = useState('pending');
  const [items, setItems] = useState<any[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setItems(null);
    try {
      setItems((await api<{ items: any[] }>(`/api/admin/suppliers?status=${status}`)).items);
    } catch (e) { toast.show(e instanceof ApiError ? e.message : 'Failed to load suppliers', 'error'); setItems([]); }
  }, [status]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void onRefresh(); }, [onRefresh]);

  const decide = async (id: string, next: 'approved' | 'rejected') => {
    try {
      await api(`/api/admin/suppliers/${id}`, { method: 'PATCH', body: { status: next, notes: notes[id] || undefined } });
      toast.show(`Supplier ${next === 'approved' ? 'approved — dashboard unlocked' : 'rejected — notified by email'}`);
      await load();
      await onRefresh();
    } catch (e) { toast.show(e instanceof ApiError ? e.message : 'Update failed', 'error'); }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input-lux max-w-[200px]">
          <option value="pending">Awaiting approval</option><option value="approved">Approved</option>
          <option value="rejected">Rejected</option><option value="all">All</option>
        </select>
        <span className="text-sm text-stone">{items ? `${items.length} suppliers` : 'Loading…'}</span>
      </div>

      {!items ? <Spinner label="Loading suppliers…" /> : items.length === 0 ? (
        <EmptyState title="Queue is clear" body="No supplier registrations with this status." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((s) => (
            <article key={s.id} className="card-lux p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-2xl">{s.company_name}</h3>
                  <p className="text-sm text-stone">{s.contact_name} · {s.email}</p>
                  <p className="mt-1 text-xs text-stone">
                    {s.country ?? '—'} · {s.spa_count} listing{s.spa_count === 1 ? '' : 's'} · registered {s.created_at?.slice(0, 10)}
                    {s.website && <> · <a href={s.website} target="_blank" rel="noreferrer" className="text-moss hover:underline">website</a></>}
                  </p>
                </div>
                <span className={cn('badge', s.status === 'approved' ? 'bg-sage/20 text-moss' : s.status === 'rejected' ? 'bg-red-900/10 text-red-900/80' : 'bg-gold/15 text-[#8a6d2f]')}>{s.status}</span>
              </div>
              {s.notes && <p className="mt-3 rounded-lg bg-sand/70 px-3 py-2 text-xs text-stone">Note: {s.notes}</p>}
              {s.status === 'pending' && (
                <div className="mt-4 space-y-3">
                  <Field label="Internal notes (optional)">
                    <input value={notes[s.id] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [s.id]: e.target.value }))} className="input-lux" placeholder="Checked references…" />
                  </Field>
                  <div className="flex gap-2">
                    <button onClick={() => decide(s.id, 'approved')} className="btn-ink !px-5 !py-2 text-xs">Approve & unlock dashboard</button>
                    <button onClick={() => decide(s.id, 'rejected')} className="btn-outline !px-5 !py-2 text-xs">Reject</button>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {toast.node}
    </div>
  );
}

/* ————— Spa listings (approval + featuring) ————— */

function SpasTab({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const toast = useToast();
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<any[] | null>(null);
  const [preview, setPreview] = useState<any | null>(null);

  const load = useCallback(async () => {
    setItems(null);
    try {
      const qs = new URLSearchParams();
      if (status !== 'all') qs.set('status', status);
      if (q) qs.set('q', q);
      setItems((await api<{ items: any[] }>(`/api/admin/spas?${qs}`)).items);
    } catch (e) { toast.show(e instanceof ApiError ? e.message : 'Failed to load listings', 'error'); setItems([]); }
  }, [status, q]);

  useEffect(() => { const t = setTimeout(() => void load(), q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);
  useEffect(() => { void onRefresh(); }, [onRefresh]);

  const patch = async (id: string, body: Record<string, unknown>, label: string) => {
    try {
      await api(`/api/admin/spas/${id}`, { method: 'PATCH', body });
      toast.show(label);
      await load();
      await onRefresh();
    } catch (e) { toast.show(e instanceof ApiError ? e.message : 'Update failed', 'error'); }
  };

  const remove = async (id: string, name: string) => {
    if (!confirm(`Delete “${name}” permanently? Its bookings stay in the ledger.`)) return;
    try { await api(`/api/admin/spas/${id}`, { method: 'DELETE' }); toast.show('Listing deleted'); await load(); }
    catch (e) { toast.show(e instanceof ApiError ? e.message : 'Delete failed', 'error'); }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search listings…" className="input-lux max-w-xs" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input-lux max-w-[180px]">
          <option value="all">All statuses</option><option value="pending">Awaiting approval</option>
          <option value="approved">Live</option><option value="rejected">Rejected</option>
        </select>
        <span className="text-sm text-stone">{items ? `${items.length} listings` : 'Loading…'}</span>
      </div>

      {!items ? <Spinner label="Loading listings…" /> : items.length === 0 ? (
        <EmptyState title="No listings here" body="Supplier submissions appear for approval automatically." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((s) => (
            <article key={s.id} className="card-lux overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.image} alt={s.name} width={400} height={240} loading="lazy" className="h-36 w-full object-cover" />
              <div className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display text-xl leading-tight">{s.name}</h3>
                  <span className={cn('badge shrink-0', s.status === 'approved' ? 'bg-sage/20 text-moss' : s.status === 'pending' ? 'bg-gold/15 text-[#8a6d2f]' : 'bg-red-900/10 text-red-900/80')}>{s.status}</span>
                </div>
                <p className="text-xs text-stone">{s.city}, {s.country} · {s.company_name} ({s.supplier_status})</p>
                <p className="text-xs text-stone">★ {Number(s.rating).toFixed(1)} · {s.review_count} reviews {s.featured ? '· featured' : ''}</p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {s.status !== 'approved' && (
                    <button onClick={() => patch(s.id, { status: 'approved' }, 'Listing approved & published')} className="badge border border-moss/40 text-moss hover:bg-moss/10">Approve</button>
                  )}
                  {s.status === 'pending' && (
                    <button onClick={() => patch(s.id, { status: 'rejected' }, 'Listing rejected — owner notified')} className="badge border border-red-900/40 text-red-900/80 hover:bg-red-900/10">Reject</button>
                  )}
                  {s.status === 'approved' && (
                    <button onClick={() => patch(s.id, { featured: !s.featured }, s.featured ? 'Removed from featured' : 'Added to featured')} className="badge border border-gold/50 text-[#8a6d2f] hover:bg-gold/10">
                      {s.featured ? 'Unfeature' : 'Feature'}
                    </button>
                  )}
                  <button onClick={() => setPreview(s)} className="badge border border-ink/15 text-stone hover:bg-ink/5">Details</button>
                  <button onClick={() => remove(s.id, s.name)} className="badge border border-red-900/30 text-stone hover:bg-red-900/5">Delete</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview?.name ?? ''} wide>
        {preview && (
          <div className="space-y-3 text-sm">
            <p className="text-stone">{preview.city}, {preview.country} — slug <code>{preview.slug}</code></p>
            <p className="rounded-lg bg-sand/70 px-3 py-2">{preview.summary}</p>
            <p className="text-xs text-stone">Owner: {preview.company_name} · supplier status {preview.supplier_status} · created {preview.created_at?.slice(0, 10)}</p>
            <div className="flex gap-2 pt-2">
              <a href={`/spas/${preview.slug}/`} target="_blank" rel="noreferrer" className="btn-outline !px-5 !py-2 text-xs">View public page</a>
            </div>
          </div>
        )}
      </Modal>
      {toast.node}
    </div>
  );
}
