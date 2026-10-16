'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { money, durationLabel, initials } from '@/lib/format';
import { Spinner, Stars } from '@/components/ui';
import { BookingWidget } from '@/components/BookingWidget';
import { DAYS, SITE } from '@/lib/content';

/* Listings created after the static export was built have no prerendered HTML
   at /spas/<slug>/. The worker serves THIS route's exported shell at that URL
   (no listing data baked in), and this component reads the real pathname,
   fetches /api/spas/<slug> and swaps the shell's placeholder for the true
   content — the shell's baked markup lives in #spa-sections and is replaced
   wholesale on mount. */

type Loaded = {
  slug: string;
  spa: any;
  treatments: any[];
  packages: any[];
  reviews: any[];
};

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export default function SpaFallbackPage() {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setError(null);
    const slug = decodeURIComponent(window.location.pathname.split('/')[2] ?? '');
    if (!slug) { setError('Listing not found'); return; }
    try {
      const d = await api<Loaded>(`/api/spas/${encodeURIComponent(slug)}`);
      if (!d?.spa || d.spa.status !== 'approved') { setError('Listing not found'); return; }
      setData({ ...d, slug });
      document.title = `${d.spa.name} — ${d.spa.city} | Book ${d.spa.name} Spa Online`;
      const meta = document.querySelector('meta[name="description"]');
      if (meta) meta.setAttribute('content', String(d.spa.summary ?? '').slice(0, 155));
      let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (!canonical) {
        canonical = document.createElement('link');
        canonical.rel = 'canonical';
        document.head.appendChild(canonical);
      }
      canonical.href = `${window.location.origin}/spas/${slug}/`;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load this listing');
    }
  }, []);

  useEffect(() => { void load(); }, [load, attempt]);

  useEffect(() => {
    if (!data || !bodyRef.current) return;
    bodyRef.current.innerHTML = renderSections(data);
  }, [data]);

  if (error) {
    return (
      <section className="container-site flex min-h-[50vh] flex-col items-center justify-center gap-4 py-32 text-center">
        <h1 className="font-display text-4xl">{error}</h1>
        <p className="max-w-md text-sm text-stone">The listing may have been removed or is awaiting approval.</p>
        <div className="flex gap-2">
          <button onClick={() => setAttempt((n) => n + 1)} className="btn-ink !px-6 !py-2.5 text-xs">Try again</button>
          <a href="/spas/" className="btn-outline !px-6 !py-2.5 text-xs">Browse all spas</a>
        </div>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="container-site flex min-h-[60vh] items-center justify-center py-32">
        <Spinner label="Loading listing…" />
      </section>
    );
  }

  const { spa, treatments, packages, reviews } = data;
  const items = treatments.map((t: any) => ({
    slug: t.slug, name: t.name, durationMin: t.duration ?? t.duration_min, price: t.price,
  }));
  const pkgItems = packages.map((p: any) => ({
    slug: p.slug, name: p.name, durationMin: p.duration ?? p.duration_min, price: p.price,
  }));

  return (
    <>
      <section className="relative flex min-h-[52vh] items-end pb-12 pt-44">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={spa.image} alt={`${spa.name}, ${spa.city}`} width={1920} height={1080} fetchPriority="high"
          className="absolute inset-0 -z-20 h-full w-full object-cover" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink/90 via-ink/45 to-ink/60" />
        <div className="container-site">
          <nav aria-label="Breadcrumb" className="mb-4 text-xs text-champagne/70">
            <a href="/" className="text-champagne/70 hover:text-gold">Home</a>
            <span className="mx-2" aria-hidden>/</span>
            <a href="/spas/" className="text-champagne/70 hover:text-gold">Spas</a>
            <span className="mx-2" aria-hidden>/</span>
            <a href={`/destinations/${spa.destination}/`} className="text-champagne/70 hover:text-gold">{spa.city}</a>
          </nav>
          <h1 className="font-display text-5xl text-cream sm:text-6xl">{spa.name}</h1>
          <p className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-champagne/85">
            <span className="flex items-center gap-2">
              <Stars rating={Number(spa.rating) || 0} /> {Number(spa.rating || 0).toFixed(1)} · {spa.reviewCount ?? 0} reviews
            </span>
            <span>{spa.city}, {spa.country}</span>
            <span className="text-gold-soft">{'$'.repeat(Number(spa.priceLevel) || 3)}</span>
          </p>
        </div>
      </section>

      <section className="container-site grid gap-12 py-14 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-12">
          <div>
            <p className="eyebrow">The house</p>
            <h2 className="mt-3 font-display text-4xl">A sanctuary in {spa.city}</h2>
            <div className="mt-5 space-y-4 text-[0.98rem] leading-relaxed text-stone">
              {(Array.isArray(spa.description) && spa.description.length ? spa.description : [spa.summary])
                .map((p: string, i: number) => <p key={i}>{p}</p>)}
            </div>
          </div>
          <div id="spa-sections" ref={bodyRef} />
        </div>

        <aside id="book" className="lg:sticky lg:top-28 lg:self-start">
          {items.length + pkgItems.length > 0 ? (
            <BookingWidget spaSlug={spa.slug} treatments={items} packages={pkgItems} />
          ) : (
            <div className="card-lux p-6 text-center">
              <p className="font-display text-2xl">Menu coming soon</p>
              <p className="mt-2 text-sm text-stone">This listing has no bookable treatments yet.</p>
            </div>
          )}
          <p className="mt-4 text-center text-xs text-stone">Operated by the spa · Powered by {SITE.name}</p>
        </aside>
      </section>
    </>
  );
}

/* ————— imperative sections (replaces the shell's placeholder) ————— */

function renderSections(d: Loaded): string {
  const { spa, treatments, packages, reviews } = d;

  const gallery = Array.isArray(spa.gallery) ? spa.gallery.filter(Boolean) : [];
  const galleryHtml = gallery.length ? `
    <div>
      <p class="eyebrow">Gallery</p>
      <h2 class="mt-3 font-display text-4xl">Inside ${esc(spa.name)}</h2>
      <div class="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        ${gallery.map((src: string, i: number) => `
          <a href="${esc(src)}" target="_blank" rel="noopener noreferrer" class="group relative block overflow-hidden rounded-xl border border-ink/8 bg-sand">
            <img src="${esc(src)}" alt="${esc(spa.name)} — photo ${i + 1}" width="600" height="450" loading="lazy" class="aspect-[4/3] w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
          </a>`).join('')}
      </div>
    </div>` : '';

  const treatmentsHtml = treatments.length ? `
    <div>
      <p class="eyebrow">Treatments</p>
      <h2 class="mt-3 font-display text-4xl">Menu &amp; prices</h2>
      <ul class="mt-6 divide-y divide-ink/8 border-y border-ink/8">
        ${treatments.map((t: any) => `
          <li class="flex items-start justify-between gap-6 py-5">
            <div>
              <h3 class="font-display text-2xl">${esc(t.name)}</h3>
              <p class="mt-1 max-w-xl text-sm text-stone">${esc(t.description)}</p>
              <p class="mt-2 text-xs uppercase tracking-[0.18em] text-stone">${esc(durationLabel(t.duration ?? t.duration_min))} · ${esc(t.category)}</p>
            </div>
            <div class="whitespace-nowrap pt-1 text-right">
              <p class="font-display text-2xl text-moss">${esc(money(t.price))}</p>
              <a href="#book" class="text-xs uppercase tracking-[0.16em] text-gold hover:underline">Book →</a>
            </div>
          </li>`).join('')}
      </ul>
    </div>` : '';

  const packagesHtml = packages.length ? `
    <div>
      <p class="eyebrow">Curated days</p>
      <h2 class="mt-3 font-display text-4xl">Spa packages</h2>
      <div class="mt-6 grid gap-5 sm:grid-cols-2">
        ${packages.map((p: any) => `
          <article class="card-lux overflow-hidden">
            <img src="${esc(p.image)}" alt="${esc(p.name)}" width="600" height="380" loading="lazy" class="aspect-[16/10] w-full object-cover" />
            <div class="p-5">
              <div class="flex items-baseline justify-between gap-3">
                <h3 class="font-display text-2xl">${esc(p.name)}</h3>
                <span class="font-medium text-moss">${esc(money(p.price))}</span>
              </div>
              <p class="mt-2 text-sm text-stone">${esc(p.blurb ?? p.description)}</p>
              <ul class="mt-3 space-y-1 text-xs text-stone">
                ${(Array.isArray(p.includes) ? p.includes : []).map((inc: string) =>
                  `<li class="flex gap-2"><span class="text-gold" aria-hidden>✦</span>${esc(inc)}</li>`).join('')}
              </ul>
              <p class="mt-3 text-xs uppercase tracking-[0.16em] text-stone">${esc(durationLabel(p.duration ?? p.duration_min))}</p>
            </div>
          </article>`).join('')}
      </div>
    </div>` : '';

  const facilities = Array.isArray(spa.facilities) ? spa.facilities : [];
  const hours = Array.isArray(spa.hours) ? spa.hours : [];
  const facilitiesHoursHtml = `
    <div class="grid gap-8 sm:grid-cols-2">
      <div>
        <p class="eyebrow">Facilities</p>
        <ul class="mt-4 grid gap-2 text-sm text-stone">
          ${facilities.length
            ? facilities.map((f: string) => `<li class="flex gap-2"><span class="text-gold" aria-hidden>✦</span>${esc(f)}</li>`).join('')
            : '<li>No facilities listed yet.</li>'}
        </ul>
      </div>
      <div>
        <p class="eyebrow">Opening hours</p>
        <ul class="mt-4 grid gap-1.5 text-sm">
          ${DAYS.map((d: string, i: number) => `
            <li class="flex justify-between border-b border-ink/6 pb-1.5">
              <span class="text-stone">${esc(d)}</span>
              <span>${hours[i]?.closed ? 'Closed' : `${esc(hours[i]?.open ?? '—')} – ${esc(hours[i]?.close ?? '—')}`}</span>
            </li>`).join('')}
        </ul>
        <p class="mt-4 text-sm text-stone">${esc(spa.address)}</p>
      </div>
    </div>`;

  const reviewsHtml = reviews.length ? `
    <div>
      <p class="eyebrow">Guest voices</p>
      <h2 class="mt-3 font-display text-4xl">Reviews</h2>
      <div class="mt-6 grid gap-5 sm:grid-cols-2">
        ${reviews.map((r: any) => `
          <figure class="card-lux p-5">
            <Stars rating="${Number(r.rating)}" />
            <p class="mt-3 font-display text-xl leading-snug">${esc(r.title)}</p>
            <p class="mt-2 text-sm leading-relaxed text-stone">${esc(r.body)}</p>
            <figcaption class="mt-4 flex items-center gap-3 text-sm">
              <span class="flex h-9 w-9 items-center justify-center rounded-full bg-gold/15 text-xs text-[#8a6d2f]">${esc(initials(r.name))}</span>
              <span><span class="block">${esc(r.name)}</span>${r.city ? `<span class="block text-xs text-stone">${esc(r.city)}</span>` : ''}</span>
            </figcaption>
          </figure>`).join('')}
      </div>
    </div>` : '';

  return [galleryHtml, treatmentsHtml, packagesHtml, facilitiesHoursHtml, reviewsHtml]
    .filter(Boolean)
    .map((html) => `<div class="space-y-12">${html}</div>`)
    .join('');
}
