import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SearchSpas } from '@/components/SearchSpas';

export const metadata: Metadata = {
  title: 'Find & Book Luxury Spas | Live Availability',
  description: 'Search vetted luxury spas by destination, treatment category, date and price. Real-time availability and instant confirmation from BookYourSpa.',
  alternates: { canonical: '/spas/' },
};

export default function SpasPage() {
  return (
    <Suspense fallback={<div className="py-40 text-center text-stone">Loading…</div>}>
      <SearchSpas />
    </Suspense>
  );
}
