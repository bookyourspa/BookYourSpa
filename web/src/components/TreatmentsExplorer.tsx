'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { TREATMENT_CATALOG, CATEGORIES, SPAS } from '@/lib/content';
import { money, durationLabel, cn } from '@/lib/format';

export function TreatmentsExplorer() {
  const params = useSearchParams();
  const initialCat = params.get('category') ?? '';
  const [category, setCategory] = useState(initialCat);
  const [q, setQ] = useState('');

  const items = useMemo(
    () => TREATMENT_CATALOG.filter((t) =>
      (!category || t.category === category) &&
      (!q || t.name.toLowerCase().includes(q.toLowerCase()) || t.blurb.toLowerCase().includes(q.toLowerCase()))
    ),
    [category, q]
  );

  const spasFor = (slug: string) => SPAS.filter((s) => s.treatments.some((t) => t.slug === slug));

  return (
    <>
      <section className="bg-forest pb-14 pt-40 text-champagne">
        <div className="container-site">
          <p className="eyebrow">The menu</p>
          <h1 className="mt-3 font-display text-5xl text-cream sm:text-6xl">Treatments & rituals</h1>
          <p className="mt-3 max-w-2xl text-champagne/75">
            {TREATMENT_CATALOG.length} signature experiences across {SPAS.length} houses — every price is the lowest available.
          </p>
          <div className="mt-7 grid max-w-3xl gap-3 sm:grid-cols-[1.4fr_1fr]">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search treatments…" className="input-lux" aria-label="Search treatments" />
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="input-lux" aria-label="Filter by category">
              <option value="">All categories</option>
              {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          </div>
        </div>
      </section>

      <section className="container-site py-14">
        <div className="mb-8 flex flex-wrap gap-2">
          <button onClick={() => setCategory('')}
            className={cn('badge border', !category ? 'border-gold bg-gold/15 text-[#8a6d2f]' : 'border-ink/15 text-stone')}>All</button>
          {CATEGORIES.map((c) => (
            <button key={c.slug} onClick={() => setCategory(c.slug)}
              className={cn('badge border', category === c.slug ? 'border-gold bg-gold/15 text-[#8a6d2f]' : 'border-ink/15 text-stone')}>
              {c.name}
            </button>
          ))}
        </div>

        {items.length === 0 ? (
          <p className="py-16 text-center text-stone">No treatments match that search.</p>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {items.map((t) => {
              const spas = spasFor(t.slug);
              return (
                <article key={t.slug} className="card-lux flex flex-col overflow-hidden" id={t.slug}>
                  <div className="relative aspect-[16/10] overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={t.image} alt={t.name} width={640} height={400} loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-700 hover:scale-105" />
                    <span className="badge absolute right-4 top-4 bg-cream/90 text-forest">{durationLabel(t.duration)}</span>
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <div className="flex items-baseline justify-between gap-3">
                      <h2 className="font-display text-2xl">{t.name}</h2>
                      <span className="whitespace-nowrap text-sm font-medium text-moss">from {money(t.price)}</span>
                    </div>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-stone">{t.description}</p>
                    <div className="mt-4 flex items-center justify-between border-t border-ink/8 pt-4">
                      <span className="text-xs uppercase tracking-[0.16em] text-stone">
                        {CATEGORIES.find((c) => c.slug === t.category)?.name}
                      </span>
                      <Link href={spas[0] ? `/spas/${spas[0].slug}/#book` : '/spas/'} className="text-xs uppercase tracking-[0.16em] text-gold hover:underline">
                        Book at {spas.length === 1 ? spas[0].city : `${spas.length} spas`} →
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
