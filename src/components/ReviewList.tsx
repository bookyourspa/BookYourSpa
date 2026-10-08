"use client";

export function ReviewList({ reviews }: { reviews: any[] }) {
  if (!reviews.length) {
    return <p className="mt-3 text-sm text-ink-soft">No reviews yet — be the first after your treatment!</p>;
  }
  return (
    <div className="mt-4 space-y-4">
      {reviews.map((r) => (
        <div key={r.id} className="card p-4">
          <div className="flex items-center justify-between">
            <div className="font-semibold">{r.customer_name}</div>
            <div className="text-gold-deep" aria-label={`${r.rating} out of 5`}>
              {"★".repeat(r.rating)}
              <span className="text-[#ddd5c2]">{"★".repeat(5 - r.rating)}</span>
            </div>
          </div>
          <div className="mt-0.5 text-xs text-ink-soft">
            {r.treatment_name ? `${r.treatment_name} · ` : ""}
            {new Date(r.created_at).toLocaleDateString()}
          </div>
          {r.body && <p className="mt-2 text-sm text-ink-soft">{r.body}</p>}
          {r.reply && (
            <div className="mt-3 rounded-lg bg-cream-deep p-3 text-sm">
              <div className="text-xs font-bold uppercase tracking-wide text-jade">Spa reply</div>
              <p className="mt-1 text-ink-soft">{r.reply}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
