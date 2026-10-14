import Link from 'next/link';

export function Logo({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  return (
    <Link href="/" className="group inline-flex items-center gap-3" aria-label="BookYourSpa home">
      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-gold/60 bg-ink/80 text-gold transition-transform duration-300 group-hover:rotate-6">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden>
          <path d="M12 3c2.5 3 5 4.4 5 7.6A5 5 0 0 1 12 16a5 5 0 0 1-5-5.4C7 7.4 9.5 6 12 3Z" stroke="currentColor" strokeWidth="1.3" />
          <path d="M4 20c3.2-1.4 5.8-1.4 8 0 2.2-1.4 4.8-1.4 8 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </span>
      {!compact && (
        <span className="leading-none">
          <span className={`block font-display text-xl tracking-[0.14em] ${light ? 'text-champagne' : 'text-ink'}`}>BOOKYOURSPA</span>
          <span className="mt-1 block text-[0.6rem] uppercase tracking-[0.42em] text-gold">the art of feeling renewed</span>
        </span>
      )}
    </Link>
  );
}
