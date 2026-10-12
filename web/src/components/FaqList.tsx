'use client';

import { useState } from 'react';
import { cn } from '@/lib/format';

export function FaqList({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="divide-y divide-ink/8 border-y border-ink/8">
      {items.map((f, i) => {
        const isOpen = open === i;
        return (
          <div key={f.q}>
            <button
              onClick={() => setOpen(isOpen ? null : i)}
              className="flex w-full items-center justify-between gap-6 py-5 text-left"
              aria-expanded={isOpen}
            >
              <span className={cn('font-display text-xl transition-colors sm:text-[1.35rem]', isOpen && 'text-moss')}>{f.q}</span>
              <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-all duration-300',
                isOpen ? 'rotate-45 border-gold text-gold' : 'border-ink/15 text-stone')} aria-hidden>+</span>
            </button>
            <div className={cn('grid transition-all duration-300', isOpen ? 'grid-rows-[1fr] pb-6 opacity-100' : 'grid-rows-[0fr] opacity-0')}>
              <div className="overflow-hidden">
                <p className="max-w-3xl text-[0.95rem] leading-relaxed text-stone">{f.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
