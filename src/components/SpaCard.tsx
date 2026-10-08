import Link from "next/link";

export function SpaCard({ spa }: { spa: any }) {
  const types: string[] = typeof spa.spa_types === "string" ? JSON.parse(spa.spa_types || "[]") : spa.spa_types || [];
  return (
    <Link href={`/spa/${spa.slug}`} className="card group overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg">
      <div
        className="h-44 w-full bg-cover bg-center"
        style={{
          backgroundImage: spa.cover_url
            ? `url(${spa.cover_url})`
            : "linear-gradient(135deg, #0f4f45 0%, #17756a 55%, #c2a15a 130%)",
        }}
      >
        <div className="flex h-full items-end justify-between p-3">
          {spa.is_featured ? <span className="badge bg-gold text-white">Featured</span> : <span />}
          {spa.rating_count > 0 && (
            <span className="badge bg-white/95 text-jade">★ {Number(spa.rating_avg).toFixed(1)} ({spa.rating_count})</span>
          )}
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-lg font-bold leading-snug group-hover:text-jade">{spa.name}</h3>
        </div>
        <div className="mt-1 text-sm text-ink-soft">📍 {spa.city}{spa.country ? `, ${spa.country}` : ""}</div>
        {spa.description && (
          <p className="mt-2 line-clamp-2 text-sm text-ink-soft">{spa.description}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {types.slice(0, 3).map((t) => (
            <span key={t} className="chip !py-0.5 !text-[0.68rem]">{t.replace(/-/g, " ")}</span>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-[#f0ebdd] pt-3">
          <span className="text-sm text-ink-soft">
            {spa.treatment_count > 0 ? `${spa.treatment_count} treatments` : ""}
          </span>
          {spa.price_from ? (
            <span className="text-sm font-bold text-jade">
              from {spa.currency || "IDR"} {Number(spa.price_from).toLocaleString()}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
