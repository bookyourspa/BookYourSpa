import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TreatmentsExplorer } from '@/components/TreatmentsExplorer';

export const metadata: Metadata = {
  title: 'Massage Treatments, Facials & Spa Rituals — Book Online',
  description: 'Explore signature massages, hot stone therapy, facials, body wraps, sauna rituals and hydrotherapy. Compare prices and book with live availability.',
  alternates: { canonical: '/treatments/' },
};

export default function TreatmentsPage() {
  return (
    <Suspense fallback={<div className="py-40 text-center text-stone">Loading…</div>}>
      <TreatmentsExplorer />
    </Suspense>
  );
}
