import type { Metadata } from 'next';
import { RegisterCard } from '@/components/AuthForms';

export const metadata: Metadata = {
  title: 'List Your Spa — Supplier Registration',
  description: 'Register your spa or wellness house on BookYourSpa. Manage treatments, prices, availability and bookings from a private dashboard.',
  alternates: { canonical: '/supplier/register/' },
};

export default function SupplierRegisterPage() {
  return (
    <section className="container-site flex min-h-[80vh] items-center justify-center py-36">
      <RegisterCard role="supplier" />
    </section>
  );
}
