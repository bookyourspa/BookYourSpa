import type { Metadata } from 'next';
import { RegisterCard } from '@/components/AuthForms';

export const metadata: Metadata = {
  title: 'Create an Account — BookYourSpa',
  description: 'Create a free BookYourSpa account to book treatments, manage reservations and receive booking confirmations.',
  alternates: { canonical: '/register/' },
};

export default function RegisterPage() {
  return (
    <section className="container-site flex min-h-[80vh] items-center justify-center py-36">
      <RegisterCard role="customer" />
    </section>
  );
}
