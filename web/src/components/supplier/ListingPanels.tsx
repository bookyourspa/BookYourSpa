'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { money, prettyDate, cn } from '@/lib/format';
import { EmptyState, Field, Modal, Spinner, useToast } from '@/components/ui';

/* ————— Staff ————— */

const EMPTY_STAFF = { name: '', role: 'Therapist', phone: '', email: '', active: true };

export function StaffPanel({ spaId }: { spaId: string }) {
  const toast = useToast();
  const [items, setItems] = useState<any[] | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState(EMPTY_STAFF);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setItems(null);
    try { setItems((await api<{ items: any[] }>(`/api/supplier/spas/${spaId}/staff`)).items); }
    catch (e) { toast.show(e instanceof ApiError ? e.message : 'Failed to load team', 'error'); setItems([]); }
  }, [spaId]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (form.name.trim().length < 2) { toast.show('A name is required', 'error'); return; }
    setBusy(true);
    try {
      if (editing === 'new') await api(`/api/supplier/spas/${spaId}/staff`, { method: 'POST', body: form });
      else await api(`/api/supplier/staff/${editing.id}`, { method: 'PATCH', body: form });
      setEditing(null); setForm(EMPTY_STAFF); toast.show('Team member saved'); await load();
    } catch (e) { toast.show(e instanceof ApiError ? e.message : 'Save failed', 'error'); }
    finally { setBusy(false); }
  };

  const remove = async (m: any) => {
    if (!confirm(`Remove “${m.name}” from the team?`)) return;
    try { await api(`/api/supplier/staff/${m.id}`, { method: 'DELETE' }); toast.show('Team member removed'); await load(); }
    catch (e) { toast.show(e instanceof ApiError ? e.message : 'Delete failed', 'error'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-stone">{items ? `${items.length} team member${items.length === 1 ? '' : 's'}` : 'Loading…'}</p>
        <button onClick={() => { setEditing('new'); setForm(EMPTY_STAFF); }} className="btn-ink !px-5 !py-2 text-xs">+ Add member</button>
      </div>

      {!items ? <Spinner label="Loading team…" /> : items.length === 0 ? (
        <EmptyState title="No team members yet" body="Add the therapists and front-desk staff who work at this spa." />
      ) : (
        <div className="overflow-x-auto">
          <table className="table-lux">
            <thead><tr><th>Name</th><th>Role</th><th>Contact</th><th>Active</th><th></th></tr></thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id}>
                  <td className="font-medium">{m.name}</td>
                  <td className="text-xs">{m.role}</td>
                  <td className="text-xs text-stone">{[m.phone, m.email].filter(Boolean).join(' · ') || '—'}</td>
                  <td><span className={cn('badge', m.active ? 'bg-sage/20 text-moss' : 'bg-stone/15 text-stone')}>{m.active ? 'live' : 'hidden'}</span></td>
                  <td>
                    <div className="flex gap-1">
                      <button onClick={() => { setEditing(m); setForm({ name: m.name, role: m.role ?? 'Therapist', phone: m.phone ?? '', email: m.email ?? '', active: !!m.active }); }}
                        className="badge border border-ink/15 text-stone hover:bg-ink/5">Edit</button>
                      <button onClick={() => remove(m)} className="badge border border-red-900/30 text-stone hover:bg-red-900/5">Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add team member' : 'Edit team member'}>
        <div className="space-y-4">
          <Field label="Name"><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input-lux" /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Role"><input value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className="input-lux" placeholder="Therapist" /></Field>
            <Field label="Active"><select value={form.active ? '1' : '0'} onChange={(e) => setForm((f) => ({ ...f, active: e.target.value === '1' }))} className="input-lux"><option value="1">Yes</option><option value="0">No</option></select></Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Phone"><input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="input-lux" /></Field>
            <Field label="Email"><input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="input-lux" /></Field>
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={busy} className="btn-ink !px-6 !py-2.5 text-xs">{busy ? 'Saving…' : 'Save member'}</button>
            <button onClick={() => setEditing(null)} className="btn-outline !px-5 !py-2.5 text-xs">Cancel</button>
          </div>
        </div>
      </Modal>
      {toast.node}
    </div>
  );
}

/* ————— Promotions (listing-scoped promo codes) ————— */

const EMPTY_PROMO = {
  code: '', title: '', description: '', discountType: 'percent', value: '',
  minSpend: '0', startsAt: '', endsAt: '', active: true,
};

const discountLabel = (o: any) => (o.discount_type === 'percent' ? `${o.value}% off` : `${money(o.value)} off`);

export function PromotionsPanel({ spaId }: { spaId: string }) {
  const toast = useToast();
  const [items, setItems] = useState<any[] | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState(EMPTY_PROMO);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setItems(null);
    try { setItems((await api<{ items: any[] }>(`/api/supplier/spas/${spaId}/offers`)).items); }
    catch (e) { toast.show(e instanceof ApiError ? e.message : 'Failed to load promotions', 'error'); setItems([]); }
  }, [spaId]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    const code = form.code.trim().toUpperCase();
    const value = Number(form.value);
    if (code.length < 3) { toast.show('Code must be at least 3 characters', 'error'); return; }
    if (form.title.trim().length < 3) { toast.show('Give the promotion a title', 'error'); return; }
    if (!(value > 0)) { toast.show('Discount value must be positive', 'error'); return; }
    if (!form.startsAt || !form.endsAt) { toast.show('Choose the start and end dates', 'error'); return; }
    if (form.endsAt < form.startsAt) { toast.show('End date must be after start date', 'error'); return; }
    setBusy(true);
    const body = { ...form, code, value, minSpend: Number(form.minSpend) || 0 };
    try {
      if (editing === 'new') await api(`/api/supplier/spas/${spaId}/offers`, { method: 'POST', body });
      else await api(`/api/supplier/offers/${editing.id}`, { method: 'PATCH', body });
      setEditing(null); setForm(EMPTY_PROMO); toast.show('Promotion saved'); await load();
    } catch (e) { toast.show(e instanceof ApiError ? e.message : 'Save failed', 'error'); }
    finally { setBusy(false); }
  };

  const toggle = async (o: any) => {
    try { await api(`/api/supplier/offers/${o.id}`, { method: 'PATCH', body: { active: !o.active } }); await load(); }
    catch (e) { toast.show(e instanceof ApiError ? e.message : 'Update failed', 'error'); }
  };

  const remove = async (o: any) => {
    if (!confirm(`Remove promo “${o.code}”?`)) return;
    try { await api(`/api/supplier/offers/${o.id}`, { method: 'DELETE' }); toast.show('Promotion removed'); await load(); }
    catch (e) { toast.show(e instanceof ApiError ? e.message : 'Delete failed', 'error'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-stone">{items ? `${items.length} promotion${items.length === 1 ? '' : 's'}` : 'Loading…'}</p>
        <button onClick={() => { setEditing('new'); setForm(EMPTY_PROMO); }} className="btn-ink !px-5 !py-2 text-xs">+ New promotion</button>
      </div>

      {!items ? <Spinner label="Loading promotions…" /> : items.length === 0 ? (
        <EmptyState title="No promotions yet" body="Create a promo code guests apply at checkout — it works on this listing only." />
      ) : (
        <div className="space-y-3">
          {items.map((o) => (
            <article key={o.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/8 px-4 py-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold">{o.code}</span>
                  <span className={cn('badge', o.active ? 'bg-sage/20 text-moss' : 'bg-stone/15 text-stone')}>{o.active ? 'active' : 'paused'}</span>
                </p>
                <p className="mt-0.5 truncate text-sm">{o.title} <span className="text-stone">· {discountLabel(o)}{Number(o.min_spend) > 0 ? ` · min ${money(o.min_spend)}` : ''}</span></p>
                <p className="text-xs text-stone">{o.starts_at} → {o.ends_at}</p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => toggle(o)} className="badge border border-ink/15 text-stone hover:bg-ink/5">{o.active ? 'Pause' : 'Activate'}</button>
                <button onClick={() => { setEditing(o); setForm({ code: o.code, title: o.title, description: o.description ?? '', discountType: o.discount_type, value: String(o.value), minSpend: String(o.min_spend), startsAt: o.starts_at, endsAt: o.ends_at, active: !!o.active }); }}
                  className="badge border border-ink/15 text-stone hover:bg-ink/5">Edit</button>
                <button onClick={() => remove(o)} className="badge border border-red-900/30 text-stone hover:bg-red-900/5">Remove</button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'New promotion' : 'Edit promotion'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Code" hint={editing !== 'new' ? 'Existing codes cannot change' : 'Guests type this at checkout'}>
              <input value={form.code} disabled={!!editing && editing !== 'new'} maxLength={30}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                className="input-lux font-mono disabled:opacity-50" />
            </Field>
            <Field label="Title"><input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="input-lux" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Discount type">
              <select value={form.discountType} onChange={(e) => setForm((f) => ({ ...f, discountType: e.target.value }))} className="input-lux">
                <option value="percent">Percentage off</option>
                <option value="fixed">Fixed amount off</option>
              </select>
            </Field>
            <Field label={form.discountType === 'percent' ? 'Percent off' : 'Amount off'}>
              <input type="number" min={1} value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} className="input-lux" />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Min spend"><input type="number" min={0} value={form.minSpend} onChange={(e) => setForm((f) => ({ ...f, minSpend: e.target.value }))} className="input-lux" /></Field>
            <Field label="Starts"><input type="date" value={form.startsAt} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))} className="input-lux" /></Field>
            <Field label="Ends"><input type="date" value={form.endsAt} onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))} className="input-lux" /></Field>
          </div>
          <Field label="Description"><textarea rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="input-lux" /></Field>
          <div className="flex gap-2">
            <button onClick={save} disabled={busy} className="btn-ink !px-6 !py-2.5 text-xs">{busy ? 'Saving…' : 'Save promotion'}</button>
            <button onClick={() => setEditing(null)} className="btn-outline !px-5 !py-2.5 text-xs">Cancel</button>
          </div>
        </div>
      </Modal>
      {toast.node}
    </div>
  );
}

/* ————— Reviews (read-only; moderated by the platform team) ————— */

const stars = (n: number) => {
  const full = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
  return '★'.repeat(full) + '☆'.repeat(5 - full);
};

export function ReviewsPanel({ slug }: { slug: string }) {
  const toast = useToast();
  const [items, setItems] = useState<any[] | null>(null);

  const load = useCallback(async () => {
    setItems(null);
    try { setItems((await api<{ items: any[] }>(`/api/reviews?spa=${encodeURIComponent(slug)}&limit=48`)).items); }
    catch (e) { toast.show(e instanceof ApiError ? e.message : 'Failed to load reviews', 'error'); setItems([]); }
  }, [slug]);

  useEffect(() => { void load(); }, [load]);

  if (!items) return <Spinner label="Loading reviews…" />;

  if (items.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyState title="No reviews yet" body="Guests can review after a completed booking; each one is checked by our moderation team before it goes live." />
        {toast.node}
      </div>
    );
  }

  const avg = items.reduce((sum, r) => sum + Number(r.rating), 0) / items.length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          <span className="text-gold" aria-hidden>{stars(avg)}</span>{' '}
          <span className="font-medium">{avg.toFixed(1)}</span>
          <span className="text-stone"> · {items.length} review{items.length === 1 ? '' : 's'}</span>
        </p>
        <p className="text-xs text-stone">Moderated before publishing</p>
      </div>
      <div className="space-y-3">
        {items.map((r) => (
          <article key={r.id} className="rounded-xl border border-ink/8 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-gold" aria-label={`${r.rating} out of 5 stars`}>{stars(r.rating)}</span>
              <span className="text-xs text-stone">{prettyDate(String(r.createdAt ?? r.created_at).slice(0, 10))}</span>
            </div>
            {r.title && <p className="mt-1 text-sm font-medium">{r.title}</p>}
            <p className="mt-0.5 text-sm text-stone">{r.body}</p>
            <p className="mt-1 text-xs text-stone">{[r.name, r.city].filter(Boolean).join(' · ')}</p>
          </article>
        ))}
      </div>
      {toast.node}
    </div>
  );
}
