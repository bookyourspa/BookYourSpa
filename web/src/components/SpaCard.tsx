import Link from 'next/link';
import { money, cn } from '@/lib/format';
import { CATEGORIES } from '@/lib/content';

export type SpaCardData = {
  slug: string; name: string; city: string; country: string; image: string;
  summary: string; rating: number; reviewCount: number; minPrice: number | null; categories: string[];
  featured?: boolean;
};

export function SpaCard({ spa, priority = false, className }: { spa: SpaCardData; priority?: boolean; className?: string }) {
  const labels = spa.categories.map((c) => CATEGORIES.find((x) => x.slug === c)?.name).filter(Boolean).slice(0, 2);
  return (
    <Link href={`/spas/${spa.slug}/`}
      className={cn('group relative flex flex-col overflow-hidden rounded-2xl bg-white shadow-[0_24px_60px_-45px_rgba(16,28,22,0.7)] ring-1 ring-ink/5 transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_34px_70px_-40px_rgba(16,28,22,0.55)]', className)}
      aria-label={`${spa.name} in ${spa.city}`}>
      <div className="relative aspect-[4/3] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={spa.image} alt={`${spa.name} — ${spa.city}`} width={800} height={600} loading={priority ? 'eager' : 'lazy'}
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.06]" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/5 to-transparent" />
        {spa.featured && (
          <span className="badge absolute left-4 top-4 bg-cream/90 text-forest backdrop-blur">Featured</span>
        )}
        <span className="absolute bottom-4 left-4 flex items-center gap-1.5 rounded-full bg-cream/92 px-3 py-1 text-xs font-medium text-forest">
          <span className="text-gold" aria-hidden>★</span> {spa.rating.toFixed(1)}
          <span className="text-stone">({spa.reviewCount})</span>
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-2xl leading-tight group-hover:text-moss">{spa.name}</h3>
          <span className="whitespace-nowrap pt-1 text-xs uppercase tracking-[0.16em] text-stone">{spa.city}</span>
        </div>
        <p className="line-clamp-2 text-sm leading-relaxed text-stone">{spa.summary}</p>
        <div className="mt-auto flex items-center justify-between gap-3 pt-2">
          <span className="text-xs text-stone">{labels.join(' · ')}</span>
          <span className="text-sm">
            {spa.minPrice != null && <span className="text-stone">from </span>}
            <span className="font-medium text-ink">{spa.minPrice != null ? money(spa.minPrice) : '—'}</span>
          </span>
        </div>
      </div>
    </Link>
  );
}
