'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { money, durationLabel, cn } from '@/lib/format';
import { EmptyState, Field, Modal, Spinner, useToast } from '@/components/ui';
import { CATEGORIES, DESTINATIONS } from '@/lib/content';
import { SPA_CATEGORY_OPTIONS, SPA_TYPE_OPTIONS, GENRE_OPTIONS, DELIVERY_OPTIONS, labelOf } from '@/lib/taxonomy';
import { fileToDataUrl } from '@/lib/images';
import { RichText } from '@/components/RichText';
import { BookingsPanel } from './BookingsPanel';
import { StaffPanel, PromotionsPanel, ReviewsPanel } from './ListingPanels';

const MAPS_URL_RE = /^https:\/\/(www\.|maps\.)?google\.[a-z.]+\/maps\/(place|search)\//i;

const IMAGE_CHOICES = [
  '/images/spa/aurora-lounge.jpg', '/images/spa/serenity-pool.jpg', '/images/spa/orchid-stones.jpg',
  '/images/spa/lagoon-nightpool.jpg', '/images/spa/zenith-sauna.jpg', '/images/spa/ubud-villas.jpg',
  '/images/spa/haven-sauna.jpg', '/images/spa/maison-stones.jpg', '/images/spa/terrace-loungers.jpg',
  '/images/spa/embrace-massage.jpg', '/images/spa/lumiere-facial.jpg', '/images/spa/zen-hands.jpg',
];

const emptySpa = {
  name: '', destination: 'london', city: '', country: '', address: '', summary: '',
  image: IMAGE_CHOICES[0], gallery: [] as string[], facilities: '', categories: ['massage'], priceLevel: 3,
  phone: '', website: '', mapsUrl: '', mapsLink: '',
  spaCategories: [] as string[], spaTypes: [] as string[], genre: 'both', doorstep: false,
};

const parseJsonArr = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map(String);
  try { const p = JSON.parse(String(v ?? '[]')); return Array.isArray(p) ? p.map(String) : []; } catch { return []; }
};

const isImageUrl = (s: string) => /^(https?:\/\/|\/)\S{2,299}$/.test(String(s ?? ''));

/* ————— mode: list of listings + create/edit ————— */

export function SpaManager({ spaId, mode = 'list', onChanged }: { spaId?: string; mode?: 'list' | 'catalog'; onChanged: () => void }) {
  const toast = useToast();
  const [items, setItems] = useState<any[] | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<any>(emptySpa);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [galleryLink, setGalleryLink] = useState('');

  const load = useCallback(async () => {
    try { setItems((await api<{ items: any[] }>('/api/supplier/spas')).items); }
    catch (e) { toast.show(e instanceof ApiError ? e.message : 'Failed to load listings', 'error'); setItems([]); }
  }, []);

  useEffect(() => { if (mode === 'list') void load(); }, [mode, load]);

  if (mode === 'catalog' && spaId) return <CatalogManager spaId={spaId} />;

  const openCreate = () => { setEditing('new'); setForm(emptySpa); setGalleryLink(''); };
  const openEdit = (s: any) => {
    setEditing(s.id);
    setGalleryLink('');
    setForm({
      name: s.name, destination: s.destination, city: s.city, country: s.country, address: s.address,
      summary: s.summary, image: s.image, gallery: s.gallery ?? [], facilities: (s.facilities || []).join(', '),
      categories: s.categories?.length ? s.categories : ['massage'], priceLevel: s.priceLevel,
      phone: s.phone ?? '', website: s.website ?? '', mapsUrl: s.mapsUrl ?? '', mapsLink: s.mapsUrl ?? '',
      spaCategories: s.spaCategories ?? [], spaTypes: s.spaTypes ?? [], genre: s.genre ?? 'both', doorstep: !!s.doorstep,
    });
  };

  /* Paste a Google Maps place link → the worker recovers name, pin, phone,
     website and address server-side (no CORS) and we fill whatever is empty. */
  const importFromMaps = async () => {
    const url = form.mapsLink?.trim() ?? '';
    if (!MAPS_URL_RE.test(url)) {
      toast.show('Paste a Google Maps place link — the …/maps/place/… URL from “Share”', 'error');
      return;
    }
    setImporting(true);
    try {
      const d = await api<any>('/api/supplier/places/import', { method: 'POST', body: { url } });
      setForm((f: any) => ({
        ...f,
        name: f.name.trim() ? f.name : (d.name ?? f.name),
        address: f.address.trim().length >= 5 ? f.address : (d.address ?? f.address),
        phone: f.phone.trim() ? f.phone : (d.phone ?? ''),
        website: f.website.trim() ? f.website : (d.website ?? ''),
        mapsUrl: d.mapsUrl ?? url,
        lat: d.lat ?? f.lat, lng: d.lng ?? f.lng,
      }));
      const got = ['name', 'address', 'phone', 'website'].filter((k) => d[k]);
      const miss = d.missing?.length ? ` — add ${d.missing.join(', ')} by hand` : '';
      toast.show(`Imported from Google Maps: ${got.join(', ')}${miss}`, 'success');
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : 'Import failed — paste the link again', 'error');
    } finally { setImporting(false); }
  };

  const save = async () => {
    if (form.name.trim().length < 3 || form.summary.trim().length < 10 || !form.city || !form.address) {
      toast.show('Name, city, address and a 10+ character summary are required', 'error'); return;
    }
    if (!isImageUrl(form.image)) {
      toast.show('Cover image must be a link (https://… or /images/…)', 'error'); return;
    }
    if (form.website && !/^https?:\/\//i.test(form.website)) {
      toast.show('Website must start with https://', 'error'); return;
    }
    setBusy(true);
    const body = {
      ...form,
      facilities: String(form.facilities).split(',').map((f: string) => f.trim()).filter(Boolean),
      gallery: (form.gallery ?? []).filter(Boolean).slice(0, 12),
      priceLevel: Number(form.priceLevel),
      phone: String(form.phone ?? '').trim(),
      website: String(form.website ?? '').trim(),
      mapsUrl: String(form.mapsUrl ?? form.mapsLink ?? '').trim(),
      spaCategories: form.spaCategories ?? [],
      spaTypes: form.spaTypes ?? [],
      genre: form.genre ?? 'both',
      doorstep: !!form.doorstep,
    };
    try {
      if (editing === 'new') {
        await api('/api/supplier/spas', { method: 'POST', body });
        toast.show('Listing submitted for approval');
      } else {
        await api(`/api/supplier/spas/${editing}`, { method: 'PATCH', body });
        toast.show('Listing updated');
      }
      setEditing(null); await load(); onChanged();
    } catch (e) { toast.show(e instanceof ApiError ? e.message : 'Save failed', 'error'); }
    finally { setBusy(false); }
  };

  const remove = async (id: string, name: string) => {
    if (!confirm(`Remove “${name}”? Upcoming bookings must be cancelled first.`)) return;
    try { await api(`/api/supplier/spas/${id}`, { method: 'DELETE' }); toast.show('Listing removed'); await load(); onChanged(); }
    catch (e) { toast.show(e instanceof ApiError ? e.message : 'Delete failed', 'error'); }
  };

  const uploadImages = async (files: FileList | null, target: 'cover' | 'gallery') => {
    if (!files || files.length === 0) return;
    if (editing === 'new') { toast.show('Save the listing first, then upload photos', 'error'); return; }
    setUploading(true);
    try {
      let added = 0;
      for (const file of Array.from(files)) {
        if (target === 'gallery' && form.gallery.length + added >= 12) {
          toast.show('Gallery is full — 12 images max', 'error'); break;
        }
        const dataUrl = await fileToDataUrl(file);
        const res = await api<{ url: string }>(`/api/supplier/spas/${editing}/images`, { method: 'POST', body: { dataUrl } });
        if (target === 'cover') setForm((f: any) => ({ ...f, image: res.url }));
        else { setForm((f: any) => ({ ...f, gallery: [...f.gallery, res.url] })); added++; }
      }
      if (target === 'cover') toast.show('Cover photo uploaded');
      else if (added > 0) toast.show(`${added} photo${added === 1 ? '' : 's'} added to gallery`);
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : 'Upload failed', 'error');
    } finally { setUploading(false); }
  };

  const addGalleryLink = () => {
    const url = galleryLink.trim();
    if (!isImageUrl(url)) { toast.show('Paste a valid image link (https://… or /images/…)', 'error'); return; }
    if (form.gallery.length >= 12) { toast.show('Gallery is full — 12 images max', 'error'); return; }
    setForm((f: any) => ({ ...f, gallery: [...f.gallery, url] }));
    setGalleryLink('');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-stone">{items ? `${items.length} listing${items.length === 1 ? '' : 's'}` : 'Loading…'}</p>
        <button onClick={openCreate} className="btn-ink !px-5 !py-2.5 text-xs">+ New listing</button>
      </div>

      {!items ? <Spinner label="Loading listings…" /> : items.length === 0 ? (
        <EmptyState title="Create your first listing" body="Add your spa, its treatments and opening hours — we review new listings within one business day."
          action={<button onClick={openCreate} className="btn-gold">Start a listing</button>} />
      ) : (
        <div className="space-y-4">
          {items.map((s) => (
            <ListingCard key={s.id} s={s} onEdit={() => openEdit(s)} onRemove={() => remove(s.id, s.name)} onChanged={onChanged} />
          ))}
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'New listing' : 'Edit listing'} wide>
        <div className="space-y-4">
          <Field label="Spa name"><input value={form.name} onChange={(e) => setForm((f: any) => ({ ...f, name: e.target.value }))} className="input-lux" /></Field>

          <Field label="Google Maps link" hint="Paste your place's …/maps/place/… URL — we'll pull the name, map pin, phone and website from it automatically">
            <div className="flex gap-2">
              <input value={form.mapsLink ?? ''} onChange={(e) => setForm((f: any) => ({ ...f, mapsLink: e.target.value }))}
                placeholder="https://www.google.com/maps/place/…" className="input-lux" inputMode="url" />
              <button type="button" onClick={importFromMaps} disabled={importing}
                className="btn-outline !px-4 !py-2 text-xs whitespace-nowrap disabled:opacity-50">
                {importing ? 'Importing…' : 'Import from Maps'}
              </button>
            </div>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Destination">
              <select value={form.destination} onChange={(e) => setForm((f: any) => ({ ...f, destination: e.target.value }))} className="input-lux">
                {DESTINATIONS.map((d) => <option key={d.slug} value={d.slug}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="City"><input value={form.city} onChange={(e) => setForm((f: any) => ({ ...f, city: e.target.value }))} className="input-lux" /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Country"><input value={form.country} onChange={(e) => setForm((f: any) => ({ ...f, country: e.target.value }))} className="input-lux" /></Field>
            <Field label="Address"><input value={form.address} onChange={(e) => setForm((f: any) => ({ ...f, address: e.target.value }))} className="input-lux" /></Field>
          </div>
          <Field label="Summary" hint="Shown on cards and search results (10–300 characters)">
            <textarea value={form.summary} onChange={(e) => setForm((f: any) => ({ ...f, summary: e.target.value }))} rows={2} maxLength={300} className="input-lux" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Phone"><input value={form.phone ?? ''} onChange={(e) => setForm((f: any) => ({ ...f, phone: e.target.value }))}
              maxLength={40} placeholder="+62 818 0467 7778" className="input-lux" /></Field>
            <Field label="Website"><input value={form.website ?? ''} onChange={(e) => setForm((f: any) => ({ ...f, website: e.target.value }))}
              maxLength={300} placeholder="https://…" className="input-lux" inputMode="url" /></Field>
            <Field label="Genre type" hint="Who the house serves">
              <select value={form.genre ?? 'both'} onChange={(e) => setForm((f: any) => ({ ...f, genre: e.target.value }))} className="input-lux">
                {GENRE_OPTIONS.map((g) => <option key={g.slug} value={g.slug}>{g.name}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Spa category" hint="How your listing is classified — pick up to 6">
            <div className="flex flex-wrap gap-2">
              {SPA_CATEGORY_OPTIONS.map((c) => {
                const on = (form.spaCategories ?? []).includes(c.slug);
                return (
                  <button key={c.slug} type="button"
                    onClick={() => setForm((f: any) => ({ ...f, spaCategories: on ? f.spaCategories.filter((x: string) => x !== c.slug) : [...(f.spaCategories ?? []), c.slug] }))}
                    className={cn('badge border px-3 py-1', on ? 'border-gold bg-gold/15 text-[#8a6d2f]' : 'border-ink/15 text-stone')}>
                    {c.name}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Spa type" hint="The treatments and rituals you offer — pick up to 14">
            <div className="flex flex-wrap gap-2">
              {SPA_TYPE_OPTIONS.map((t) => {
                const on = (form.spaTypes ?? []).includes(t.slug);
                return (
                  <button key={t.slug} type="button"
                    onClick={() => setForm((f: any) => ({ ...f, spaTypes: on ? f.spaTypes.filter((x: string) => x !== t.slug) : [...(f.spaTypes ?? []), t.slug] }))}
                    className={cn('badge border px-3 py-1', on ? 'border-gold bg-gold/15 text-[#8a6d2f]' : 'border-ink/15 text-stone')}>
                    {t.name}
                  </button>
                );
              })}
            </div>
          </Field>
          <label className="flex w-fit cursor-pointer items-center gap-2.5 rounded-xl border border-ink/10 px-3.5 py-2.5 text-sm">
            <input type="checkbox" checked={!!form.doorstep} onChange={(e) => setForm((f: any) => ({ ...f, doorstep: e.target.checked }))}
              className="h-4 w-4 accent-[#c8a96a]" />
            <span>Accept <strong>Massage on Call / Doorstep Spa</strong> — therapists travel to the guest</span>
          </label>
          <Field label="Facilities" hint="Comma separated">
            <input value={form.facilities} onChange={(e) => setForm((f: any) => ({ ...f, facilities: e.target.value }))} className="input-lux" placeholder="Sauna, Steam room, Couples suite" />
          </Field>
          <Field label="Categories">
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => {
                const on = form.categories.includes(c.slug);
                return (
                  <button key={c.slug} type="button"
                    onClick={() => setForm((f: any) => ({ ...f, categories: on ? f.categories.filter((x: string) => x !== c.slug) : [...f.categories, c.slug] }))}
                    className={cn('badge border px-3 py-1', on ? 'border-gold bg-gold/15 text-[#8a6d2f]' : 'border-ink/15 text-stone')}>
                    {c.name}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Cover / card image" hint="Used on cards, search results and your page hero — paste a link or upload from your device">
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="h-24 w-36 shrink-0 overflow-hidden rounded-xl border border-ink/10 bg-sand">
                  {form.image ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={form.image} alt="Cover preview" width={288} height={192}
                      onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                      className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="flex flex-col gap-2">
                  <label className={cn('btn-outline inline-flex w-fit cursor-pointer !px-4 !py-2 text-xs', (uploading || editing === 'new') && 'pointer-events-none opacity-50')}>
                    {uploading ? 'Uploading…' : '⬆ Upload from device'}
                    <input type="file" accept="image/*" className="hidden" disabled={uploading || editing === 'new'}
                      onChange={(e) => { void uploadImages(e.target.files, 'cover'); e.target.value = ''; }} />
                  </label>
                  <p className="max-w-[14rem] text-[11px] leading-snug text-stone">
                    {editing === 'new' ? 'Save the listing first to upload — links work now.' : 'JPG, PNG or WebP — resized automatically.'}
                  </p>
                </div>
              </div>
              <input value={form.image} maxLength={300} placeholder="https://…/cover.jpg"
                onChange={(e) => setForm((f: any) => ({ ...f, image: e.target.value }))} className="input-lux" />
              <div className="grid grid-cols-4 gap-2">
                {IMAGE_CHOICES.map((img) => (
                  <button key={img} type="button" onClick={() => setForm((f: any) => ({ ...f, image: img }))}
                    className={cn('overflow-hidden rounded-lg border-2 transition-colors', form.image === img ? 'border-gold' : 'border-transparent')}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img} alt="Cover option" width={120} height={80} loading="lazy" className="h-16 w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          </Field>
          <Field label={`Gallery — ${form.gallery.length} of 12`} hint="Photos in the gallery section of your listing page — add by link or upload">
            <div className="space-y-3">
              {form.gallery.length > 0 && (
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {form.gallery.map((src: string, i: number) => (
                    <div key={`${src}-${i}`} className="relative overflow-hidden rounded-lg border border-ink/10 bg-sand">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt={`Gallery image ${i + 1}`} width={160} height={120} loading="lazy"
                        onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                        className="aspect-[4/3] w-full object-cover" />
                      <button type="button" aria-label={`Remove gallery image ${i + 1}`}
                        onClick={() => setForm((f: any) => ({ ...f, gallery: f.gallery.filter((_: unknown, j: number) => j !== i) }))}
                        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-ink/85 text-xs leading-none text-champagne hover:bg-ink">×</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input value={galleryLink} maxLength={500} placeholder="Paste an image link"
                  onChange={(e) => setGalleryLink(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addGalleryLink(); } }}
                  className="input-lux" />
                <button type="button" onClick={addGalleryLink} className="btn-outline !px-4 !py-2 text-xs whitespace-nowrap">Add link</button>
              </div>
              <label className={cn('btn-outline inline-flex w-fit cursor-pointer !px-4 !py-2 text-xs', (uploading || editing === 'new') && 'pointer-events-none opacity-50')}>
                {uploading ? 'Uploading…' : '+ Upload photos'}
                <input type="file" accept="image/*" multiple className="hidden" disabled={uploading || editing === 'new'}
                  onChange={(e) => { void uploadImages(e.target.files, 'gallery'); e.target.value = ''; }} />
              </label>
            </div>
          </Field>
          <div className="flex gap-2 pt-2">
            <button onClick={save} disabled={busy} className="btn-ink !px-6 !py-2.5 text-xs">{busy ? 'Saving…' : editing === 'new' ? 'Submit for approval' : 'Save changes'}</button>
            <button onClick={() => setEditing(null)} className="btn-outline !px-5 !py-2.5 text-xs">Cancel</button>
          </div>
        </div>
      </Modal>
      {toast.node}
    </div>
  );
}

/* ————— one listing card with its sub-tabs ————— */

const LISTING_TABS = [
  { id: 'booking', label: 'Booking' },
  { id: 'treatment', label: 'Treatment' },
  { id: 'staff', label: 'Staff' },
  { id: 'promotion', label: 'Promotion' },
  { id: 'review', label: 'Review' },
] as const;

type ListingTab = (typeof LISTING_TABS)[number]['id'];

function ListingCard({ s, onEdit, onRemove, onChanged }: { s: any; onEdit: () => void; onRemove: () => void; onChanged: () => void }) {
  const [tab, setTab] = useState<ListingTab | null>(null);
  return (
    <article className="card-lux space-y-4 p-4">
      <div className="flex gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={s.image} alt={s.name} width={200} height={160} loading="lazy" className="h-28 w-32 shrink-0 rounded-xl object-cover" />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate font-display text-xl">{s.name}</h3>
            <span className={cn('badge shrink-0', s.status === 'approved' ? 'bg-sage/20 text-moss' : s.status === 'pending' ? 'bg-gold/15 text-[#8a6d2f]' : 'bg-red-900/10 text-red-900/80')}>{s.status}</span>
          </div>
          <p className="text-xs text-stone">{s.city}, {s.country} · {s.counts.treatments} treatments · {s.counts.packages} packages · {s.counts.upcoming} upcoming</p>
          <p className="mt-1 line-clamp-2 text-sm text-stone">{s.summary}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 rounded-full bg-sand p-1 text-xs">
        {LISTING_TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn('rounded-full px-4 py-1.5', tab === t.id ? 'bg-ink text-champagne' : 'text-stone hover:text-ink')}>
            {t.label}
          </button>
        ))}
        <button onClick={onEdit} className="rounded-full px-4 py-1.5 text-stone hover:text-ink">Edit details</button>
        <button onClick={onRemove} aria-label={`Remove ${s.name}`} title="Remove listing"
          className="ml-auto rounded-full p-2 text-red-900/70 hover:bg-red-900/10">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" />
          </svg>
        </button>
      </div>

      {tab && (
        <div className="border-t border-ink/6 pt-4">
          {tab === 'booking' && <BookingsPanel spaId={s.id} onChanged={onChanged} />}
          {tab === 'treatment' && <CatalogManager spaId={s.id} only="treatments" />}
          {tab === 'staff' && <StaffPanel spaId={s.id} />}
          {tab === 'promotion' && <PromotionsPanel spaId={s.id} />}
          {tab === 'review' && <ReviewsPanel slug={s.slug} />}
        </div>
      )}
    </article>
  );
}

/* ————— mode: catalog (treatments, packages, hours, blocked dates) ————— */

type Catalog = { treatments: any[]; packages: any[]; hours: any[]; blocked: any[] };
const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const EMPTY_TREATMENT = {
  name: '', category: 'massage', durationMin: 60, durations: [60] as number[], price: 100,
  descriptionHtml: '', spaType: 'massages', genre: 'both', delivery: 'both',
  image: '/images/treatment/signature-massage.jpg', active: true,
};
const EMPTY_PACKAGE = {
  name: '', description: '', includes: '', durationMin: 120, price: 250,
  spaTypes: [] as string[], genre: 'both', delivery: 'both',
  image: '/images/package/retreat-day.jpg', active: true,
};

const MIN_DURATION = 15, MAX_DURATION = 480, MAX_DURATION_OPTIONS = 8;

function CatalogManager({ spaId, only }: { spaId: string; only?: 'treatments' }) {
  const toast = useToast();
  const [data, setData] = useState<Catalog | null>(null);
  const [section, setSection] = useState<'treatments' | 'packages' | 'hours'>('treatments');
  const [editingT, setEditingT] = useState<any>(null);
  const [tForm, setTForm] = useState<any>(EMPTY_TREATMENT);
  const [editingP, setEditingP] = useState<any>(null);
  const [pForm, setPForm] = useState<any>(EMPTY_PACKAGE);
  const [hours, setHours] = useState<any[]>([]);
  const [blockDate, setBlockDate] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<Catalog>(`/api/supplier/spas/${spaId}/catalog`);
      setData(d);
      const h = Array.from({ length: 7 }, (_, i) => d.hours.find((x: any) => x.day_of_week === i) ?? { day_of_week: i, open_time: '09:00', close_time: '20:00', closed: 0 });
      setHours(h);
    } catch (e) { toast.show(e instanceof ApiError ? e.message : 'Failed to load catalogue', 'error'); }
  }, [spaId]);

  useEffect(() => { setData(null); void load(); }, [load]);

  const saveTreatment = async () => {
    if (tForm.name.trim().length < 3) { toast.show('Give the treatment a name', 'error'); return; }
    const durations: number[] = [...new Set<number>((tForm.durations ?? []).map((d: any) => Math.round(Number(d))))]
      .filter((d) => Number.isFinite(d) && d >= MIN_DURATION && d <= MAX_DURATION)
      .sort((a, b) => a - b)
      .slice(0, MAX_DURATION_OPTIONS);
    if (!durations.length) { toast.show(`Add at least one duration option (${MIN_DURATION}–${MAX_DURATION} min)`, 'error'); return; }
    if (Number(tForm.price) <= 0) { toast.show('Price must be positive', 'error'); return; }
    setBusy(true);
    try {
      const body = {
        name: tForm.name, price: Number(tForm.price), durations, durationMin: durations[0],
        descriptionHtml: tForm.descriptionHtml ?? '',
        description: String(tForm.descriptionHtml ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1000) || tForm.name,
        spaType: tForm.spaType, genre: tForm.genre, delivery: tForm.delivery,
        image: tForm.image, active: tForm.active,
      };
      if (editingT && editingT !== 'new') await api(`/api/supplier/treatments/${editingT.id}`, { method: 'PATCH', body });
      else await api(`/api/supplier/spas/${spaId}/treatments`, { method: 'POST', body });
      setEditingT(null); setTForm(EMPTY_TREATMENT); toast.show('Treatment saved'); await load();
    } catch (e) { toast.show(e instanceof ApiError ? e.message : 'Save failed', 'error'); }
    finally { setBusy(false); }
  };

  const removeTreatment = async (t: any) => {
    if (!confirm(`Remove “${t.name}” from the menu?`)) return;
    try { await api(`/api/supplier/treatments/${t.id}`, { method: 'DELETE' }); toast.show('Treatment removed'); await load(); }
    catch (e) { toast.show(e instanceof ApiError ? e.message : 'Delete failed', 'error'); }
  };

  const savePackage = async () => {
    if (pForm.name.trim().length < 3) { toast.show('Give the package a name', 'error'); return; }
    setBusy(true);
    try {
      const body = {
        ...pForm, price: Number(pForm.price), durationMin: Number(pForm.durationMin),
        includes: String(pForm.includes).split(',').map((s: string) => s.trim()).filter(Boolean),
        spaTypes: pForm.spaTypes ?? [], genre: pForm.genre ?? 'both', delivery: pForm.delivery ?? 'both',
      };
      if (editingP) await api(`/api/supplier/packages/${editingP.id}`, { method: 'PATCH', body });
      else await api(`/api/supplier/spas/${spaId}/packages`, { method: 'POST', body });
      setEditingP(null); setPForm(EMPTY_PACKAGE); toast.show('Package saved'); await load();
    } catch (e) { toast.show(e instanceof ApiError ? e.message : 'Save failed', 'error'); }
    finally { setBusy(false); }
  };

  const removePackage = async (p: any) => {
    if (!confirm(`Remove “${p.name}”?`)) return;
    try { await api(`/api/supplier/packages/${p.id}`, { method: 'DELETE' }); toast.show('Package removed'); await load(); }
    catch (e) { toast.show(e instanceof ApiError ? e.message : 'Delete failed', 'error'); }
  };

  const saveHours = async () => {
    setBusy(true);
    try {
      const payload = hours.map((h) => ({ open: h.open_time, close: h.close_time, closed: !!h.closed }));
      await api(`/api/supplier/spas/${spaId}/hours`, { method: 'PUT', body: { hours: payload } });
      toast.show('Opening hours updated — availability recalculated');
    } catch (e) { toast.show(e instanceof ApiError ? e.message : 'Save failed', 'error'); }
    finally { setBusy(false); }
  };

  const addBlock = async () => {
    if (!blockDate) { toast.show('Choose a date first', 'error'); return; }
    try {
      await api(`/api/supplier/spas/${spaId}/blocked-dates`, { method: 'POST', body: { date: blockDate, reason: 'Closed' } });
      toast.show(`Blocked ${blockDate} — existing bookings cancelled and refunded`);
      setBlockDate(''); await load();
    } catch (e) { toast.show(e instanceof ApiError ? e.message : 'Failed', 'error'); }
  };

  const removeBlock = async (date: string) => {
    try { await api(`/api/supplier/spas/${spaId}/blocked-dates/${date}`, { method: 'DELETE' }); await load(); }
    catch (e) { toast.show(e instanceof ApiError ? e.message : 'Failed', 'error'); }
  };

  if (!data) return <Spinner label="Loading catalogue…" />;

  return (
    <div className="space-y-6">
      {!only && (
        <div className="flex rounded-full bg-sand p-1 text-sm sm:w-fit">
          {(['treatments', 'packages', 'hours'] as const).map((s) => (
            <button key={s} onClick={() => setSection(s)}
              className={cn('flex-1 rounded-full px-5 py-2 capitalize sm:flex-none', section === s ? 'bg-ink text-champagne' : 'text-stone hover:text-ink')}>
              {s === 'hours' ? 'Hours & closures' : `${s} (${s === 'treatments' ? data.treatments.length : data.packages.length})`}
            </button>
          ))}
        </div>
      )}

      {section === 'treatments' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => { setEditingT('new'); setTForm(EMPTY_TREATMENT); }} className="btn-ink !px-5 !py-2 text-xs">+ Add treatment</button>
          </div>
          <div className="card-lux overflow-x-auto">
            <table className="table-lux">
              <thead><tr><th>Treatment</th><th>Type</th><th>Duration</th><th>Price</th><th>Active</th><th></th></tr></thead>
              <tbody>
                {data.treatments.map((t) => (
                  <tr key={t.id}>
                    <td className="max-w-[260px]"><span className="block truncate font-medium">{t.name}</span><span className="block max-w-[260px] truncate text-xs text-stone">{String(t.description ?? '').replace(/<[^>]*>/g, ' ').slice(0, 90)}</span></td>
                    <td className="text-xs capitalize">{labelOf(SPA_TYPE_OPTIONS, t.spa_type, t.category)}</td>
                    <td className="text-xs">{(parseJsonArr(t.durations).length ? parseJsonArr(t.durations) : [t.duration_min]).map(durationLabel).join(' · ') || durationLabel(t.duration_min)}</td>
                    <td>{money(t.price)}</td>
                    <td><span className={cn('badge', t.active ? 'bg-sage/20 text-moss' : 'bg-stone/15 text-stone')}>{t.active ? 'live' : 'hidden'}</span></td>
                    <td>
                      <div className="flex gap-1">
                        <button onClick={() => { setEditingT(t); setTForm({
                          name: t.name, category: t.category, durationMin: t.duration_min,
                          durations: parseJsonArr(t.durations).map(Number).filter((n) => n > 0).length
                            ? parseJsonArr(t.durations).map(Number) : [t.duration_min],
                          price: t.price, descriptionHtml: t.description_html ?? '',
                          spaType: t.spa_type || 'massages', genre: t.genre || 'both', delivery: t.delivery || 'both',
                          image: t.image, active: !!t.active,
                        }); }}
                          className="badge border border-ink/15 text-stone hover:bg-ink/5">Edit</button>
                        <button onClick={() => removeTreatment(t)} className="badge border border-red-900/30 text-stone hover:bg-red-900/5">Remove</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {data.treatments.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-sm text-stone">No treatments yet — add your signature menu.</td></tr>}
              </tbody>
            </table>
          </div>

          <Modal open={!!editingT} onClose={() => { setEditingT(null); setTForm(EMPTY_TREATMENT); }} title={editingT !== 'new' ? 'Edit treatment' : 'Add treatment'} wide>
            <div className="space-y-4">
              <Field label="Name"><input value={tForm.name} onChange={(e) => setTForm((f: any) => ({ ...f, name: e.target.value }))} className="input-lux" /></Field>
              <Field label="Description" hint="Rich text — bold, headings, lists and links all render on your public page">
                <RichText value={tForm.descriptionHtml ?? ''} onChange={(html) => setTForm((f: any) => ({ ...f, descriptionHtml: html }))}
                  label="Treatment description" />
              </Field>
              <Field label={`Duration options — ${tForm.durations?.length ?? 0} of ${MAX_DURATION_OPTIONS}`}
                hint="Guests pick one when booking; the first is the default">
                <div className="space-y-2">
                  {(tForm.durations ?? []).map((d: number, i: number) => (
                    <div key={i} className="flex items-center gap-2">
                      <input type="number" min={MIN_DURATION} max={MAX_DURATION} step={5} value={d}
                        onChange={(e) => setTForm((f: any) => ({ ...f, durations: f.durations.map((x: number, j: number) => (j === i ? Number(e.target.value) : x)) }))}
                        className="input-lux !w-28" aria-label={`Duration option ${i + 1} in minutes`} />
                      <span className="text-xs text-stone">minutes</span>
                      {(tForm.durations?.length ?? 0) > 1 && (
                        <button type="button"
                          onClick={() => setTForm((f: any) => ({ ...f, durations: f.durations.filter((_: number, j: number) => j !== i) }))}
                          className="ml-auto text-xs text-red-900/70 hover:underline">Remove</button>
                      )}
                      {i === 0 && <span className="badge bg-gold/15 text-[#8a6d2f]">default</span>}
                    </div>
                  ))}
                  {(tForm.durations?.length ?? 0) < MAX_DURATION_OPTIONS && (
                    <button type="button"
                      onClick={() => setTForm((f: any) => ({ ...f, durations: [...(f.durations ?? []), (f.durations?.[f.durations.length - 1] ?? 60) + 30] }))}
                      className="btn-outline !px-3 !py-1.5 text-xs">+ Add duration option</button>
                  )}
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Price"><input type="number" min={1} value={tForm.price} onChange={(e) => setTForm((f: any) => ({ ...f, price: e.target.value }))} className="input-lux" /></Field>
                <Field label="Spa type">
                  <select value={tForm.spaType ?? 'massages'} onChange={(e) => setTForm((f: any) => ({ ...f, spaType: e.target.value }))} className="input-lux">
                    {SPA_TYPE_OPTIONS.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Genre type">
                  <select value={tForm.genre ?? 'both'} onChange={(e) => setTForm((f: any) => ({ ...f, genre: e.target.value }))} className="input-lux">
                    {GENRE_OPTIONS.map((g) => <option key={g.slug} value={g.slug}>{g.name}</option>)}
                  </select>
                </Field>
                <Field label="Delivery type" hint="Where this treatment happens">
                  <select value={tForm.delivery ?? 'both'} onChange={(e) => setTForm((f: any) => ({ ...f, delivery: e.target.value }))} className="input-lux">
                    {DELIVERY_OPTIONS.map((d) => <option key={d.slug} value={d.slug}>{d.name}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Visible"><select value={tForm.active ? '1' : '0'} onChange={(e) => setTForm((f: any) => ({ ...f, active: e.target.value === '1' }))} className="input-lux"><option value="1">Yes</option><option value="0">No</option></select></Field>
              <div className="flex gap-2">
                <button onClick={saveTreatment} disabled={busy} className="btn-ink !px-6 !py-2.5 text-xs">{busy ? 'Saving…' : 'Save treatment'}</button>
                <button onClick={() => { setEditingT(null); setTForm(EMPTY_TREATMENT); }} className="btn-outline !px-5 !py-2.5 text-xs">Cancel</button>
              </div>
            </div>
          </Modal>
        </div>
      )}

      {section === 'packages' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => { setEditingP('new'); setPForm(EMPTY_PACKAGE); }} className="btn-ink !px-5 !py-2 text-xs">+ Add package</button>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {data.packages.map((p) => (
              <article key={p.id} className="card-lux p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-xl">{p.name}</h3>
                    <p className="text-xs text-stone">{durationLabel(p.duration_min)} · {money(p.price)} · {p.active ? 'live' : 'hidden'}</p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditingP(p.id); setPForm({
                      name: p.name, description: p.description,
                      includes: (JSON.parse(p.includes || '[]') as string[]).join(', '),
                      durationMin: p.duration_min, price: p.price,
                      spaTypes: parseJsonArr(p.spa_types), genre: p.genre || 'both', delivery: p.delivery || 'both',
                      image: p.image, active: !!p.active,
                    }); }}
                      className="badge border border-ink/15 text-stone hover:bg-ink/5">Edit</button>
                    <button onClick={() => removePackage(p)} className="badge border border-red-900/30 text-stone hover:bg-red-900/5">Remove</button>
                  </div>
                </div>
                <p className="mt-2 text-sm text-stone">{p.description}</p>
                <ul className="mt-2 space-y-1 text-xs text-stone">
                  {(JSON.parse(p.includes || '[]') as string[]).map((inc) => <li key={inc} className="flex gap-2"><span className="text-gold" aria-hidden>✦</span>{inc}</li>)}
                </ul>
              </article>
            ))}
            {data.packages.length === 0 && <EmptyState title="No packages yet" body="Bundle treatments into half-day or full-day experiences." />}
          </div>

          <Modal open={!!editingP} onClose={() => setEditingP(null)} title={editingP === 'new' ? 'Add package' : 'Edit package'} wide>
            <div className="space-y-4">
              <Field label="Name"><input value={pForm.name} onChange={(e) => setPForm((f: any) => ({ ...f, name: e.target.value }))} className="input-lux" /></Field>
              <Field label="Description"><textarea rows={2} value={pForm.description} onChange={(e) => setPForm((f: any) => ({ ...f, description: e.target.value }))} className="input-lux" /></Field>
              <Field label="Includes" hint="Comma separated"><textarea rows={3} value={pForm.includes} onChange={(e) => setPForm((f: any) => ({ ...f, includes: e.target.value }))} className="input-lux" /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Duration (min)"><input type="number" min={30} step={15} value={pForm.durationMin} onChange={(e) => setPForm((f: any) => ({ ...f, durationMin: e.target.value }))} className="input-lux" /></Field>
                <Field label="Price"><input type="number" min={1} value={pForm.price} onChange={(e) => setPForm((f: any) => ({ ...f, price: e.target.value }))} className="input-lux" /></Field>
              </div>
              <Field label="Spa types" hint="Which spa styles this package covers — pick any">
                <div className="flex flex-wrap gap-2">
                  {SPA_TYPE_OPTIONS.map((t) => {
                    const on = (pForm.spaTypes ?? []).includes(t.slug);
                    return (
                      <button key={t.slug} type="button"
                        onClick={() => setPForm((f: any) => ({ ...f, spaTypes: on ? f.spaTypes.filter((x: string) => x !== t.slug) : [...(f.spaTypes ?? []), t.slug] }))}
                        className={cn('badge border px-3 py-1', on ? 'border-gold bg-gold/15 text-[#8a6d2f]' : 'border-ink/15 text-stone')}>
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Genre type">
                  <select value={pForm.genre ?? 'both'} onChange={(e) => setPForm((f: any) => ({ ...f, genre: e.target.value }))} className="input-lux">
                    {GENRE_OPTIONS.map((g) => <option key={g.slug} value={g.slug}>{g.name}</option>)}
                  </select>
                </Field>
                <Field label="Delivery type">
                  <select value={pForm.delivery ?? 'both'} onChange={(e) => setPForm((f: any) => ({ ...f, delivery: e.target.value }))} className="input-lux">
                    {DELIVERY_OPTIONS.map((d) => <option key={d.slug} value={d.slug}>{d.name}</option>)}
                  </select>
                </Field>
              </div>
              <div className="flex gap-2">
                <button onClick={savePackage} disabled={busy} className="btn-ink !px-6 !py-2.5 text-xs">{busy ? 'Saving…' : 'Save package'}</button>
                <button onClick={() => { setEditingP(null); setPForm(EMPTY_PACKAGE); }} className="btn-outline !px-5 !py-2.5 text-xs">Cancel</button>
              </div>
            </div>
          </Modal>
        </div>
      )}

      {section === 'hours' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card-lux space-y-3 p-6">
            <h3 className="font-display text-2xl">Opening hours</h3>
            <p className="text-xs text-stone">Slot grids are generated from these hours in real time.</p>
            <table className="table-lux">
              <thead><tr><th>Day</th><th>Opens</th><th>Closes</th><th>Closed</th></tr></thead>
              <tbody>
                {hours.map((h, i) => (
                  <tr key={i}>
                    <td>{DAYS_SHORT[i]}</td>
                    <td><input type="time" value={h.open_time} disabled={!!h.closed}
                      onChange={(e) => setHours((xs) => xs.map((x, j) => (j === i ? { ...x, open_time: e.target.value } : x)))} className="input-lux !py-1.5 disabled:opacity-40" /></td>
                    <td><input type="time" value={h.close_time} disabled={!!h.closed}
                      onChange={(e) => setHours((xs) => xs.map((x, j) => (j === i ? { ...x, close_time: e.target.value } : x)))} className="input-lux !py-1.5 disabled:opacity-40" /></td>
                    <td><input type="checkbox" checked={!!h.closed} className="h-4 w-4 accent-[#c8a96a]"
                      onChange={(e) => setHours((xs) => xs.map((x, j) => (j === i ? { ...x, closed: e.target.checked ? 1 : 0 } : x)))} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={saveHours} disabled={busy} className="btn-ink !px-6 !py-2.5 text-xs">{busy ? 'Saving…' : 'Save hours'}</button>
          </section>

          <section className="card-lux space-y-4 p-6">
            <h3 className="font-display text-2xl">Blocked dates</h3>
            <p className="text-xs text-stone">Holidays, maintenance or staff days off. Bookings on a blocked date are cancelled and refunded automatically.</p>
            <div className="flex gap-2">
              <input type="date" value={blockDate} onChange={(e) => setBlockDate(e.target.value)} className="input-lux" />
              <button onClick={addBlock} className="btn-outline !px-5 !py-2.5 text-xs whitespace-nowrap">Block date</button>
            </div>
            <ul className="space-y-2">
              {data.blocked.map((b) => (
                <li key={b.id} className="flex items-center justify-between rounded-lg border border-ink/8 px-3 py-2 text-sm">
                  <span>{b.blocked_date} <span className="text-xs text-stone">— {b.reason}</span></span>
                  <button onClick={() => removeBlock(b.blocked_date)} className="text-xs text-red-900/70 hover:underline">Remove</button>
                </li>
              ))}
              {data.blocked.length === 0 && <li className="py-4 text-center text-sm text-stone">No blocked dates.</li>}
            </ul>
          </section>
        </div>
      )}
      {toast.node}
    </div>
  );
}
