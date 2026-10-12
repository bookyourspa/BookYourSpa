'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { money, prettyDateTime, cn } from '@/lib/format';
import { STATUS_STYLES } from '@/lib/api';
import { Badge, EmptyState, Field, Modal, Spinner, useToast } from '@/components/ui';

/* ————— Payments ————— */

export function PaymentsTab() {
  const [items, setItems] = useState<any[] | null>(null);
  const toast = useToast();
  useEffect(() => {
    api<{ items: any[] }>('/api/admin/payments').then((d) => setItems(d.items)).catch(() => setItems([]));
  }, []);
  const totals = (items ?? []).reduce((a, p) => ({ amount: a.amount + Number(p.amount), commission: a.commission + Number(p.commission) }), { amount: 0, commission: 0 });

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card-lux p-5"><p className="text-[0.66rem] uppercase tracking-[0.22em] text-stone">Processed</p><p className="mt-2 font-display text-3xl">{money(totals.amount)}</p></div>
        <div className="card-lux p-5"><p className="text-[0.66rem] uppercase tracking-[0.22em] text-stone">Commission held</p><p className="mt-2 font-display text-3xl text-moss">{money(totals.commission)}</p></div>
        <div className="card-lux p-5"><p className="text-[0.66rem] uppercase tracking-[0.22em] text-stone">Transactions</p><p className="mt-2 font-display text-3xl">{items?.length ?? '—'}</p></div>
      </div>
      {!items ? <Spinner label="Loading payments…" /> : items.length === 0 ? (
        <EmptyState title="No payments yet" body="Transactions appear the moment guests complete checkout." />
      ) : (
        <div className="card-lux overflow-x-auto">
          <table className="table-lux">
            <thead><tr><th>Reference</th><th>Booking</th><th>Guest</th><th>Spa</th><th>Amount</th><th>Commission</th><th>Provider</th><th>Status</th><th>When</th></tr></thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td className="max-w-[140px] truncate font-mono text-xs">{p.ref}</td>
                  <td className="font-mono text-xs">{p.booking_code}<span className="block text-xs text-stone">{p.booking_date}</span></td>
                  <td className="max-w-[140px] truncate">{p.customer_name}</td>
                  <td className="max-w-[150px] truncate">{p.spa_name}</td>
                  <td>{money(p.amount, p.currency)}</td>
                  <td className="text-moss">{money(p.commission)}</td>
                  <td className="text-xs">{p.provider}</td>
                  <td><span className={cn('badge', STATUS_STYLES[p.status] ?? 'bg-stone/15 text-stone')}>{p.status}</span></td>
                  <td className="text-xs text-stone">{prettyDateTime(p.created_at)}</td>
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

/* ————— Commissions ————— */

export function CommissionsTab() {
  const [items, setItems] = useState<any[] | null>(null);
  useEffect(() => {
    api<{ items: any[] }>('/api/admin/commissions').then((d) => setItems(d.items)).catch(() => setItems([]));
  }, []);
  const totals = (items ?? []).reduce((a, c) => ({ gross: a.gross + Number(c.gross), commission: a.commission + Number(c.commission), payable: a.payable + Number(c.payable) }), { gross: 0, commission: 0, payable: 0 });

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card-lux p-5"><p className="text-[0.66rem] uppercase tracking-[0.22em] text-stone">Marketplace GMV</p><p className="mt-2 font-display text-3xl">{money(totals.gross)}</p></div>
        <div className="card-lux p-5"><p className="text-[0.66rem] uppercase tracking-[0.22em] text-stone">Commission earned</p><p className="mt-2 font-display text-3xl text-[#8a6d2f]">{money(totals.commission)}</p></div>
        <div className="card-lux p-5"><p className="text-[0.66rem] uppercase tracking-[0.22em] text-stone">Payable to suppliers</p><p className="mt-2 font-display text-3xl text-moss">{money(totals.payable)}</p></div>
      </div>
      {!items ? <Spinner label="Loading commissions…" /> : items.length === 0 ? (
        <EmptyState title="No commission data yet" body="Settlements appear after the first confirmed bookings." />
      ) : (
        <div className="card-lux overflow-x-auto">
          <table className="table-lux">
            <thead><tr><th>Supplier</th><th>Email</th><th>Bookings</th><th>GMV</th><th>Commission</th><th>Payable</th></tr></thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td>{c.company_name}</td>
                  <td className="text-xs text-stone">{c.email}</td>
                  <td>{c.bookings}</td>
                  <td>{money(c.gross)}</td>
                  <td className="text-[#8a6d2f]">{money(c.commission)}</td>
                  <td className="text-moss">{money(c.payable)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ————— Review moderation ————— */

export function ReviewsTab({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const [status, setStatus] = useState('pending');
  const [items, setItems] = useState<any[] | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    setItems(null);
    try { setItems((await api<{ items: any[] }>(`/api/admin/reviews?status=${status}`)).items); }
    catch { setItems([]); }
  }, [status]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void onRefresh(); }, [onRefresh]);

  const decide = async (id: string, next: string) => {
    try { await api(`/api/admin/reviews/${id}`, { method: 'PATCH', body: { status: next } }); toast.show(`Review ${next}`); await load(); }
    catch (e) { toast.show(e instanceof ApiError ? e.message : 'Update failed', 'error'); }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input-lux max-w-[180px]">
          <option value="pending">Awaiting moderation</option><option value="approved">Published</option>
          <option value="hidden">Hidden</option><option value="all">All</option>
        </select>
        <span className="text-sm text-stone">{items ? `${items.length} reviews` : 'Loading…'}</span>
      </div>
      {!items ? <Spinner label="Loading reviews…" /> : items.length === 0 ? (
        <EmptyState title="Nothing to moderate" body="Guest reviews land here before they go live." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((r) => (
            <article key={r.id} className="card-lux p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{r.title || `${r.rating}★ review`}</p>
                  <p className="mt-0.5 text-xs text-stone">{r.name} · {r.city ?? '—'} · {r.spa_name} · {r.created_at?.slice(0, 10)}</p>
                </div>
                <span className={cn('badge', r.status === 'approved' ? 'bg-sage/20 text-moss' : r.status === 'pending' ? 'bg-gold/15 text-[#8a6d2f]' : 'bg-stone/15 text-stone')}>{r.status}</span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-stone">{r.body}</p>
              <p className="mt-2 text-xs text-gold" aria-label={`${r.rating} stars`}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</p>
              <div className="mt-3 flex gap-2">
                {r.status !== 'approved' && <button onClick={() => decide(r.id, 'approved')} className="badge border border-moss/40 text-moss hover:bg-moss/10">Publish</button>}
                {r.status !== 'hidden' && <button onClick={() => decide(r.id, 'hidden')} className="badge border border-ink/15 text-stone hover:bg-ink/5">Hide</button>}
              </div>
            </article>
          ))}
        </div>
      )}
      {toast.node}
    </div>
  );
}

/* ————— Contact messages ————— */

export function MessagesTab({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const [items, setItems] = useState<any[] | null>(null);
  const [open, setOpen] = useState<any | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    try { setItems((await api<{ items: any[] }>('/api/admin/messages')).items); } catch { setItems([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void onRefresh(); }, [onRefresh]);

  const mark = async (id: string, status: string) => {
    try { await api(`/api/admin/messages/${id}`, { method: 'PATCH', body: { status } }); setOpen(null); await load(); }
    catch (e) { toast.show(e instanceof ApiError ? e.message : 'Update failed', 'error'); }
  };

  return (
    <div className="space-y-4">
      {!items ? <Spinner label="Loading inbox…" /> : items.length === 0 ? (
        <EmptyState title="Inbox zero" body="Contact-form enquiries arrive here instantly." />
      ) : items.map((m) => (
        <button key={m.id} onClick={() => { setOpen(m); if (m.status === 'new') void mark(m.id, 'read'); }}
          className={cn('card-lux flex w-full items-start gap-4 p-5 text-left hover:border-gold/50', m.status === 'new' && 'border-l-4 border-l-gold')}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-moss/10 text-moss">{m.name[0]}</span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{m.name}</span>
              <span className="text-xs text-stone">{m.email}</span>
              <span className={cn('badge', STATUS_STYLES[m.status] ?? 'bg-stone/15 text-stone')}>{m.status}</span>
            </span>
            <span className="mt-1 block truncate text-sm text-stone">{m.subject || 'Enquiry'} — {m.body}</span>
          </span>
          <span className="shrink-0 text-xs text-stone">{m.created_at?.slice(0, 10)}</span>
        </button>
      ))}

      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.subject || 'Message'}>
        {open && (
          <div className="space-y-4 text-sm">
            <p className="text-stone">{open.name} · {open.email} {open.phone && <>· {open.phone}</>}</p>
            <p className="whitespace-pre-wrap rounded-lg bg-sand/70 p-4">{open.body}</p>
            <div className="flex gap-2">
              <a href={`mailto:${open.email}`} className="btn-ink !px-5 !py-2 text-xs">Reply by email</a>
              <button onClick={() => mark(open.id, 'replied')} className="btn-outline !px-5 !py-2 text-xs">Mark as replied</button>
            </div>
          </div>
        )}
      </Modal>
      {toast.node}
    </div>
  );
}

/* ————— Content: FAQs & promotions ————— */

export function ContentTab() {
  const [sub, setSub] = useState<'faqs' | 'offers'>('faqs');
  return (
    <div className="space-y-5">
      <div className="flex rounded-full bg-sand p-1 text-sm sm:w-fit">
        {(['faqs', 'offers'] as const).map((s) => (
          <button key={s} onClick={() => setSub(s)}
            className={cn('flex-1 rounded-full px-5 py-2 capitalize sm:flex-none', sub === s ? 'bg-ink text-champagne' : 'text-stone hover:text-ink')}>
            {s === 'faqs' ? 'FAQs' : 'Promotions'}
          </button>
        ))}
      </div>
      {sub === 'faqs' ? <FaqsManager /> : <OffersManager />}
    </div>
  );
}

function FaqsManager() {
  const [items, setItems] = useState<any[] | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ question: '', answer: '', sort: 0, active: true });
  const toast = useToast();

  const load = useCallback(async () => {
    try { setItems((await api<{ items: any[] }>('/api/admin/faqs')).items); } catch { setItems([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (form.question.trim().length < 5 || form.answer.trim().length < 5) { toast.show('Question and answer need a little more detail', 'error'); return; }
    try {
      if (editing?.id) await api(`/api/admin/faqs/${editing.id}`, { method: 'PATCH', body: form });
      else await api('/api/admin/faqs', { method: 'POST', body: form });
      setEditing(null); setForm({ question: '', answer: '', sort: 99, active: true });
      toast.show('FAQ saved'); await load();
    } catch (e) { toast.show(e instanceof ApiError ? e.message : 'Save failed', 'error'); }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this FAQ?')) return;
    try { await api(`/api/admin/faqs/${id}`, { method: 'DELETE' }); toast.show('FAQ deleted'); await load(); }
    catch (e) { toast.show(e instanceof ApiError ? e.message : 'Delete failed', 'error'); }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
      <div className="space-y-3">
        {!items ? <Spinner label="Loading FAQs…" /> : items.map((f) => (
          <div key={f.id} className="card-lux p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-display text-lg">{f.question}</p>
                <p className="mt-1 line-clamp-2 text-sm text-stone">{f.answer}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button onClick={() => { setEditing(f); setForm({ question: f.question, answer: f.answer, sort: f.sort, active: !!f.active }); }}
                  className="badge border border-ink/15 text-stone hover:bg-ink/5">Edit</button>
                <button onClick={() => remove(f.id)} className="badge border border-red-900/30 text-stone hover:bg-red-900/5">Delete</button>
              </div>
            </div>
            <div className="mt-2 flex gap-2 text-[0.66rem] uppercase tracking-[0.16em] text-stone">
              <span>#{f.sort}</span><span aria-hidden>·</span><span>{f.active ? 'visible' : 'hidden'}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="card-lux h-fit space-y-3 p-5">
        <h3 className="font-display text-xl">{editing ? 'Edit FAQ' : 'New FAQ'}</h3>
        <Field label="Question"><input value={form.question} onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))} className="input-lux" /></Field>
        <Field label="Answer"><textarea value={form.answer} onChange={(e) => setForm((f) => ({ ...f, answer: e.target.value }))} rows={4} className="input-lux" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sort order"><input type="number" value={form.sort} onChange={(e) => setForm((f) => ({ ...f, sort: Number(e.target.value) }))} className="input-lux" /></Field>
          <Field label="Visible"><select value={form.active ? '1' : '0'} onChange={(e) => setForm((f) => ({ ...f, active: e.target.value === '1' }))} className="input-lux"><option value="1">Yes</option><option value="0">No</option></select></Field>
        </div>
        <div className="flex gap-2">
          <button onClick={save} className="btn-ink !px-5 !py-2 text-xs">{editing ? 'Save changes' : 'Add FAQ'}</button>
          {editing && <button onClick={() => { setEditing(null); setForm({ question: '', answer: '', sort: 99, active: true }); }} className="btn-outline !px-5 !py-2 text-xs">Cancel</button>}
        </div>
      </div>
      {toast.node}
    </div>
  );
}

function OffersManager() {
  const [items, setItems] = useState<any[] | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  type OfferForm = { code: string; title: string; description: string; discountType: string; value: number | string; minSpend: number | string; startsAt: string; endsAt: string; image: string; active: boolean };
  const empty: OfferForm = { code: '', title: '', description: '', discountType: 'percent', value: 10, minSpend: 0, startsAt: '2026-01-01', endsAt: '2026-12-31', image: '/images/treatment/signature-massage.jpg', active: true };
  const [form, setForm] = useState<OfferForm>(empty);
  const toast = useToast();

  const load = useCallback(async () => {
    try { setItems((await api<{ items: any[] }>('/api/admin/offers')).items); } catch { setItems([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!form.code || form.code.length < 3) { toast.show('Give the code at least 3 characters', 'error'); return; }
    if (!form.title || Number(form.value) <= 0) { toast.show('Title and value are required', 'error'); return; }
    if (form.endsAt < form.startsAt) { toast.show('End date must follow start date', 'error'); return; }
    try {
      const body = { ...form, discountType: form.discountType, value: Number(form.value), minSpend: Number(form.minSpend) };
      if (editing?.id) await api(`/api/admin/offers/${editing.id}`, { method: 'PATCH', body });
      else await api('/api/admin/offers', { method: 'POST', body });
      setEditing(null); setForm(empty); toast.show('Promotion saved'); await load();
    } catch (e) { toast.show(e instanceof ApiError ? e.message : 'Save failed', 'error'); }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this promotion?')) return;
    try { await api(`/api/admin/offers/${id}`, { method: 'DELETE' }); toast.show('Promotion deleted'); await load(); }
    catch (e) { toast.show(e instanceof ApiError ? e.message : 'Delete failed', 'error'); }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
      <div className="space-y-3">
        {!items ? <Spinner label="Loading promotions…" /> : items.map((o) => (
          <div key={o.id} className="card-lux flex items-start justify-between gap-3 p-4">
            <div>
              <p className="font-display text-lg">{o.title} <span className="ml-2 rounded border border-dashed border-gold/70 bg-gold/10 px-2 py-0.5 text-xs tracking-widest text-[#8a6d2f]">{o.code}</span></p>
              <p className="mt-1 text-sm text-stone">{o.description}</p>
              <p className="mt-1 text-xs text-stone">
                {o.discount_type === 'percent' ? `${o.value}% off` : `${money(o.value)} off`} · min {money(o.min_spend)} · {o.starts_at} → {o.ends_at} · {o.active ? 'active' : 'paused'}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <button onClick={() => { setEditing(o); setForm({ code: o.code, title: o.title, description: o.description, discountType: o.discount_type, value: o.value, minSpend: o.min_spend, startsAt: o.starts_at, endsAt: o.ends_at, image: o.image, active: !!o.active }); }}
                className="badge border border-ink/15 text-stone hover:bg-ink/5">Edit</button>
              <button onClick={() => remove(o.id)} className="badge border border-red-900/30 text-stone hover:bg-red-900/5">Delete</button>
            </div>
          </div>
        ))}
      </div>
      <div className="card-lux h-fit space-y-3 p-5">
        <h3 className="font-display text-xl">{editing ? 'Edit promotion' : 'New promotion'}</h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Code"><input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} className="input-lux uppercase" /></Field>
          <Field label="Type"><select value={form.discountType} onChange={(e) => setForm((f) => ({ ...f, discountType: e.target.value }))} className="input-lux"><option value="percent">Percent off</option><option value="fixed">Fixed amount</option></select></Field>
        </div>
        <Field label="Title"><input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="input-lux" /></Field>
        <Field label="Description"><textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} className="input-lux" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Value"><input type="number" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} className="input-lux" /></Field>
          <Field label="Min spend"><input type="number" value={form.minSpend} onChange={(e) => setForm((f) => ({ ...f, minSpend: e.target.value }))} className="input-lux" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts"><input type="date" value={form.startsAt} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))} className="input-lux" /></Field>
          <Field label="Ends"><input type="date" value={form.endsAt} onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))} className="input-lux" /></Field>
        </div>
        <div className="flex gap-2">
          <button onClick={save} className="btn-ink !px-5 !py-2 text-xs">{editing ? 'Save changes' : 'Create promotion'}</button>
          {editing && <button onClick={() => { setEditing(null); setForm(empty); }} className="btn-outline !px-5 !py-2 text-xs">Cancel</button>}
        </div>
      </div>
      {toast.node}
    </div>
  );
}

/* ————— SEO & platform settings ————— */

export function SettingsTab() {
  const toast = useToast();
  const [settings, setSettings] = useState<Record<string, string> | null>(null);
  const [modes, setModes] = useState<{ paymentMode: string; emailMode: string }>({ paymentMode: '—', emailMode: '—' });
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    api<{ settings: Record<string, string>; paymentMode: string; emailMode: string }>('/api/admin/settings')
      .then((d) => { setSettings(d.settings); setModes({ paymentMode: d.paymentMode, emailMode: d.emailMode }); })
      .catch(() => setSettings({}));
  }, []);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setSettings((s) => ({ ...(s ?? {}), [k]: e.target.value }));
    setDirty(true);
  };

  const save = async () => {
    if (!settings) return;
    setBusy(true);
    try {
      const res = await api<{ updated: string[] }>('/api/admin/settings', { method: 'PATCH', body: settings });
      setDirty(false);
      toast.show(`Saved ${res.updated.length} setting${res.updated.length === 1 ? '' : 's'}`);
    } catch (e) { toast.show(e instanceof ApiError ? e.message : 'Save failed', 'error'); }
    finally { setBusy(false); }
  };

  const resetLimits = async () => {
    try { await api('/api/admin/rate-limits/reset', { method: 'POST' }); toast.show('Rate-limit counters cleared'); }
    catch (e) { toast.show(e instanceof ApiError ? e.message : 'Failed', 'error'); }
  };

  if (!settings) return <Spinner label="Loading settings…" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <div className="badge bg-moss/15 text-moss">Payments: {modes.paymentMode === 'stripe' ? 'Stripe (live keys)' : 'Demo checkout — add STRIPE_SECRET_KEY to go live'}</div>
        <div className="badge bg-moss/15 text-moss">Email: {modes.emailMode === 'resend' ? 'Resend (live)' : 'Outbox only — add RESEND_API_KEY to send'}</div>
      </div>

      <section className="card-lux space-y-4 p-6" aria-labelledby="seo-heading">
        <h2 id="seo-heading" className="font-display text-2xl">Search metadata</h2>
        <Field label="Site title (appears in Google results)">
          <input value={settings.site_title ?? ''} onChange={set('site_title')} className="input-lux" />
        </Field>
        <Field label="Meta description" hint="Aim for 140–160 characters">
          <textarea value={settings.site_description ?? ''} onChange={set('site_description')} rows={2} maxLength={300} className="input-lux" />
        </Field>
        <Field label="Keywords"><input value={settings.site_keywords ?? ''} onChange={set('site_keywords')} className="input-lux" /></Field>
        <Field label="Social preview image path"><input value={settings.og_image ?? ''} onChange={set('og_image')} className="input-lux" /></Field>
      </section>

      <section className="card-lux space-y-4 p-6" aria-labelledby="hero-heading">
        <h2 id="hero-heading" className="font-display text-2xl">Homepage content</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Eyebrow"><input value={settings.hero_eyebrow ?? ''} onChange={set('hero_eyebrow')} className="input-lux" /></Field>
          <Field label="Announcement bar"><input value={settings.announcement ?? ''} onChange={set('announcement')} className="input-lux" /></Field>
        </div>
        <Field label="Hero headline"><input value={settings.hero_title ?? ''} onChange={set('hero_title')} className="input-lux" /></Field>
        <Field label="Hero subtitle"><textarea value={settings.hero_subtitle ?? ''} onChange={set('hero_subtitle')} rows={2} className="input-lux" /></Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Featured heading"><input value={settings.featured_heading ?? ''} onChange={set('featured_heading')} className="input-lux" /></Field>
          <Field label="Reviews heading"><input value={settings.reviews_heading ?? ''} onChange={set('reviews_heading')} className="input-lux" /></Field>
          <Field label="FAQ heading"><input value={settings.faq_heading ?? ''} onChange={set('faq_heading')} className="input-lux" /></Field>
        </div>
      </section>

      <section className="card-lux space-y-4 p-6" aria-labelledby="platform-heading">
        <h2 id="platform-heading" className="font-display text-2xl">Platform configuration</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Commission %" hint="0–90"><input type="number" value={settings.commission_percent ?? '15'} onChange={set('commission_percent')} className="input-lux" /></Field>
          <Field label="Free cancellation (hours)" hint="Before appointment"><input type="number" value={settings.cancellation_hours ?? '24'} onChange={set('cancellation_hours')} className="input-lux" /></Field>
          <Field label="Currency"><input value={settings.currency ?? 'USD'} onChange={set('currency')} className="input-lux" /></Field>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-ink/8 pt-4">
          <button onClick={save} disabled={busy || !dirty} className="btn-ink !px-6 !py-2.5 text-xs">{busy ? 'Saving…' : dirty ? 'Save changes' : 'All changes saved'}</button>
          <button onClick={resetLimits} className="btn-outline !px-5 !py-2.5 text-xs">Reset login rate-limits</button>
        </div>
        <p className="text-xs text-stone">
          API keys (Stripe, Resend) are managed as deployment secrets, never here. Site copy above updates the live homepage within seconds of saving.
        </p>
      </section>
      {toast.node}
    </div>
  );
}

/* ————— Email / notification log ————— */

export function EmailsTab() {
  const [items, setItems] = useState<any[] | null>(null);
  useEffect(() => {
    api<{ items: any[] }>('/api/admin/emails').then((d) => setItems(d.items)).catch(() => setItems([]));
  }, []);
  return (
    <div className="space-y-4">
      <p className="text-sm text-stone">Every message the platform generated — confirmations, cancellations, approvals. Delivery shows <strong>sent</strong> once Resend keys are configured; otherwise messages are held in the outbox.</p>
      {!items ? <Spinner label="Loading email log…" /> : items.length === 0 ? (
        <EmptyState title="No emails yet" body="Booking confirmations and account notices appear here." />
      ) : (
        <div className="card-lux overflow-x-auto">
          <table className="table-lux">
            <thead><tr><th>To</th><th>Subject</th><th>Provider</th><th>Status</th><th>Sent</th></tr></thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id}>
                  <td className="max-w-[220px] truncate text-xs">{m.to_email}</td>
                  <td className="max-w-[360px] truncate">{m.subject}</td>
                  <td className="text-xs">{m.provider}</td>
                  <td><span className={cn('badge', m.status.startsWith('sent') ? 'bg-sage/20 text-moss' : m.status.startsWith('failed') ? 'bg-red-900/10 text-red-900/80' : 'bg-gold/15 text-[#8a6d2f]')}>{m.status}</span></td>
                  <td className="text-xs text-stone">{prettyDateTime(m.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
