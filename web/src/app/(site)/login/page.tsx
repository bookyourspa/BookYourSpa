import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginArea } from '@/components/LoginArea';

export const metadata: Metadata = {
  title: 'Sign In — Customer Dashboard',
  description: 'Sign in to manage your spa bookings, payments, cancellations and personal details on BookYourSpa.',
  alternates: { canonical: '/login/' },
  robots: { index: false },
};

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="py-40 text-center text-stone">Loading…</div>}>
      <LoginArea />
    </Suspense>
  );
}
