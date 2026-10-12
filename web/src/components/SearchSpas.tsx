'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, type Spa } from '@/lib/api';
import { SpaCard } from './SpaCard';
import { CATEGORIES, DESTINATIONS } from '@/lib/content';
import { Spinner, EmptyState } from './ui';
import { cn } from '@/lib/format';

export function SearchSpas() {
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [destination, setDestination] = useState(params.get('destination') ?? '');
  const [category, setCategory] = useState(params.get('category') ?? '');
  const [sort, setSort] = useState(params.get('sort') ?? 'featured');
  const [date, setDate] = useState(params.get('date') ?? '');
  const [items, setItems] = useState<Spa[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(null);
    try {
      const qs = new URLSearchParams();
      if (q) qs.set('q', q);
      if (destination) qs.set('destination', destination);
      if (category) qs.set('category', category);
      qs.set('sort', sort);
      qs.set('limit', '24');
      const data = await api<{ items: Spa[]; total: number }>(`/api/spas?${qs.toString()}`, { signal });
      setItems(data.items); setTotal(data.total);
    } catch (e: any) {
      if (e?.code !== 'aborted') setError(e?.message ?? 'Could not load spas.');
    } finally {
      setLoading(false);
    }
  }, [q, destination, category, sort]);

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => void load(ctrl.signal), q ? 350 : 0);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [load, q]);

  const chips = useMemo(() => {
    const out: { label: string; clear: () => void }[] = [];
    if (destination) out.push({ label: DESTINATIONS.find((d) => d.slug === destination)?.name ?? destination, clear: () => setDestination('') });
    if (category) out.push({ label: CATEGORIES.find((c) => c.slug === category)?.name ?? category, clear: () => setCategory('') });
    return out;
  }, [destination, category]);

  return (
    <>
      <section className="bg-forest pb-16 pt-40 text-champagne">
        <div className="container-site">
          <p className="eyebrow">The collection</p>
          <h1 className="mt-3 font-display text-5xl text-cream sm:text-6xl">Find your sanctuary</h1>
          <p className="mt-3 max-w-2xl text-champagne/75">{total} vetted spas with live availability across {DESTINATIONS.length} destinations.</p>

          <div className="mt-8 grid gap-3 rounded-2xl bg-cream/95 p-4 text-ink sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
            <label className="block sm:col-span-2">
              <span className="label-lux">Search</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Spa, city or country…" className="input-lux" />
            </label>
            <label className="block">
              <span className="label-lux">Destination</span>
              <select value={destination} onChange={(e) => setDestination(e.target.value)} className="input-lux">
                <option value="">Anywhere</option>
                {DESTINATIONS.map((d) => <option key={d.slug} value={d.slug}>{d.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="label-lux">Category</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="input-lux">
                <option value="">All</option>
                {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="label-lux">Sort by</span>
              <select value={sort} onChange={(e) => setSort(e.target.value)} className="input-lux">
                <option value="featured">Featured</option>
                <option value="rating">Top rated</option>
                <option value="price_asc">Price: low to high</option>
                <option value="price_desc">Price: high to low</option>
                <option value="name">Name</option>
              </select>
            </label>
          </div>

          {chips.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {chips.map((c) => (
                <button key={c.label} onClick={c.clear} className="badge bg-champagne/15 text-champagne hover:bg-champagne/25">
                  {c.label} <span aria-hidden>✕</span>
                </button>
              ))}
              {date && <span className="badge bg-champagne/15 text-champagne">Date {date}</span>}
            </div>
          )}
        </div>
      </section>

      <section className="container-site py-14">
        {loading ? (
          <div className="py-24 text-center"><Spinner label="Searching the collection…" /></div>
        ) : error ? (
          <EmptyState title="Something interrupted the search" body={error} action={<button className="btn-outline" onClick={() => void load()}>Try again</button>} />
        ) : items.length === 0 ? (
          <EmptyState title="No spas match those filters" body="Try a different destination or clear a filter — the collection is refreshed weekly."
            action={<button className="btn-outline" onClick={() => { setQ(''); setDestination(''); setCategory(''); }}>Clear filters</button>} />
        ) : (
          <div className={cn('grid gap-6 sm:grid-cols-2 lg:grid-cols-3')}>
            {items.map((s, i) => (
              <SpaCard key={s.id} spa={{
                slug: s.slug, name: s.name, city: s.city, country: s.country, image: s.image,
                summary: s.summary, rating: s.rating, reviewCount: s.reviewCount,
                minPrice: s.minPrice, categories: s.categories, featured: s.featured,
              }} priority={i < 3} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
