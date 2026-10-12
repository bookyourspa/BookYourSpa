'use client';

import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/format';

export function Stars({ rating, size = 'text-sm' }: { rating: number; size?: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${size} text-gold`} aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= Math.round(rating) ? 'opacity-100' : 'opacity-25'}>★</span>
      ))}
    </span>
  );
}

export function Badge({ children, tone = 'gold' }: { children: ReactNode; tone?: 'gold' | 'sage' | 'stone' | 'red' }) {
  const tones = {
    gold: 'bg-gold/15 text-[#8a6d2f]',
    sage: 'bg-sage/20 text-moss',
    stone: 'bg-stone/15 text-stone',
    red: 'bg-red-900/10 text-red-900/80',
  } as const;
  return <span className={cn('badge', tones[tone])}>{children}</span>;
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-3 text-sm text-stone">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-gold border-t-transparent" aria-hidden />
      {label}
    </span>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="card-lux flex flex-col items-center gap-3 px-6 py-14 text-center">
      <span className="text-3xl text-gold" aria-hidden>✦</span>
      <h3 className="font-display text-2xl">{title}</h3>
      <p className="max-w-md text-sm text-stone">{body}</p>
      {action}
    </div>
  );
}

export function Field({
  label, error, children, hint,
}: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label-lux">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-stone">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-700">{error}</span>}
    </label>
  );
}

export function Toast({ message, tone = 'success', onClose }: { message: string; tone?: 'success' | 'error'; onClose: () => void }) {
  return (
    <div className={cn('fixed bottom-6 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-3 rounded-full px-5 py-3 text-sm text-white shadow-2xl animate-rise',
      tone === 'success' ? 'bg-forest' : 'bg-red-900')} role="status">
      <span aria-hidden>{tone === 'success' ? '✓' : '!'}</span>
      {message}
      <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100" aria-label="Dismiss">✕</button>
    </div>
  );
}

export function useToast() {
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  const show = (message: string, tone: 'success' | 'error' = 'success') => {
    setToast({ message, tone });
    setTimeout(() => setToast(null), 4500);
  };
  const node = toast ? <Toast message={toast.message} tone={toast.tone} onClose={() => setToast(null)} /> : null;
  return { show, node };
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/50 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div
        className={cn('max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-cream p-6 shadow-2xl sm:rounded-3xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}
        onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label={title}
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <h3 className="font-display text-2xl">{title}</h3>
          <button onClick={onClose} className="rounded-full border border-ink/15 px-3 py-1 text-sm hover:border-gold" aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
