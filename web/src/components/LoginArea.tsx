'use client';

import { useSearchParams } from 'next/navigation';
import { useAuth, useRoleGuard } from '@/lib/auth';
import { LoginCard } from './AuthForms';
import { CustomerDashboard } from './CustomerDashboard';
import { Spinner } from './ui';

export function LoginArea() {
  const params = useSearchParams();
  const next = params.get('next') ?? undefined;
  const payment = params.get('payment');
  const booking = params.get('booking');
  const { user, loading } = useAuth();
  const { allowed } = useRoleGuard('customer');

  if (loading) {
    return <div className="flex min-h-[70vh] items-center justify-center pt-32"><Spinner label="Checking your session…" /></div>;
  }

  if (!user) {
    return (
      <section className="container-site flex min-h-[80vh] flex-col items-center justify-center py-40">
        <LoginCard next={next} />
      </section>
    );
  }

  if (user.role === 'admin' || user.role === 'supplier') {
    return <div className="flex min-h-[70vh] items-center justify-center pt-32"><Spinner label="Opening your dashboard…" /></div>;
  }

  if (!allowed) {
    return <div className="flex min-h-[70vh] items-center justify-center pt-32"><Spinner label="Opening your dashboard…" /></div>;
  }

  return (
    <section className="container-site py-32 sm:py-36">
      {payment && booking && (
        <p className={`mb-6 rounded-xl px-4 py-3 text-sm ${payment === 'success' ? 'bg-sage/20 text-moss' : 'bg-gold/15 text-[#8a6d2f]'}`}>
          {payment === 'success'
            ? `Payment received for booking ${booking}. Your confirmation is on its way.`
            : `Payment for booking ${booking} was cancelled — you can complete it from your bookings below.`}
        </p>
      )}
      <CustomerDashboard />
    </section>
  );
}
