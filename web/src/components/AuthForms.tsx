'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Field } from './ui';

const validatePassword = (pw: string) =>
  pw.length >= 8 && /[a-zA-Z]/.test(pw) && /\d/.test(pw)
    ? ''
    : 'Use at least 8 characters with both letters and numbers';

export function LoginCard({ next }: { next?: string }) {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError('Enter your email and password.'); return; }
    setBusy(true); setError(null);
    try {
      const user = await login(email, password);
      const target = next && next.startsWith('/') ? next : user.role === 'admin' ? '/admin' : user.role === 'supplier' ? '/supplier' : '/login';
      router.replace(target);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign-in failed.');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card-lux w-full max-w-md space-y-4 p-8" noValidate>
      <div className="text-center">
        <h1 className="font-display text-4xl">Welcome back</h1>
        <p className="mt-1.5 text-sm text-stone">Sign in to your BookYourSpa account</p>
      </div>
      <Field label="Email">
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" className="input-lux" placeholder="you@example.com" />
      </Field>
      <Field label="Password">
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" className="input-lux" placeholder="••••••••" />
      </Field>
      {error && <p className="rounded-lg bg-red-900/8 px-4 py-3 text-sm text-red-900" role="alert">{error}</p>}
      <button className="btn-gold w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      <p className="text-center text-sm text-stone">
        New here? <Link href="/register/" className="text-moss underline underline-offset-4">Create an account</Link>
      </p>
      <p className="text-center text-xs text-stone">
        Spa owner? <Link href="/supplier/register/" className="text-moss underline underline-offset-4">Supplier sign-in & registration</Link>
      </p>
    </form>
  );
}

export function RegisterCard({ role }: { role: 'customer' | 'supplier' }) {
  const { register } = useAuth();
  const router = useRouter();
  const isSupplier = role === 'supplier';
  const [values, setValues] = useState({
    name: '', email: '', password: '', phone: '',
    companyName: isSupplier ? '' : undefined, country: isSupplier ? '' : undefined, website: isSupplier ? '' : undefined,
  });
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [k]: e.target.value }));

  const errors = {
    name: values.name.trim().length < 2 ? 'Enter your full name' : '',
    email: !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email) ? 'Enter a valid email address' : '',
    password: validatePassword(values.password),
    companyName: isSupplier && !(values.companyName ?? '').trim() ? 'Enter your business name' : '',
  };
  const valid = !errors.name && !errors.email && !errors.password && !errors.companyName;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    setBusy(true); setError(null);
    try {
      const res = await register({ role, ...values });
      if (isSupplier) {
        router.replace('/supplier/');
      } else {
        void res;
        router.replace('/login/');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Registration failed.');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card-lux w-full max-w-lg space-y-4 p-8" noValidate>
      <div className="text-center">
        <h1 className="font-display text-4xl">{isSupplier ? 'List your spa' : 'Create your account'}</h1>
        <p className="mt-1.5 text-sm text-stone">
          {isSupplier
            ? 'Two minutes now, one business day of review, then your diary is live.'
            : 'Book treatments, manage reservations and track your calm.'}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" error={touched ? errors.name : ''}>
          <input value={values.name} onChange={set('name')} className="input-lux" autoComplete="name" />
        </Field>
        <Field label="Email" error={touched ? errors.email : ''}>
          <input value={values.email} onChange={set('email')} type="email" className="input-lux" autoComplete="email" />
        </Field>
      </div>
      {isSupplier && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business name" error={touched ? errors.companyName : ''}>
            <input value={values.companyName} onChange={set('companyName')} className="input-lux" />
          </Field>
          <Field label="Country">
            <input value={values.country} onChange={set('country')} className="input-lux" placeholder="United Kingdom" />
          </Field>
        </div>
      )}
      {isSupplier && (
        <Field label="Website (optional)">
          <input value={values.website} onChange={set('website')} className="input-lux" placeholder="https://" />
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Password" error={touched ? errors.password : ''} hint="8+ characters, letters and numbers">
          <input value={values.password} onChange={set('password')} type="password" autoComplete={isSupplier ? 'new-password' : 'new-password'} className="input-lux" />
        </Field>
        <Field label="Phone (optional)">
          <input value={values.phone} onChange={set('phone')} className="input-lux" autoComplete="tel" />
        </Field>
      </div>
      {error && <p className="rounded-lg bg-red-900/8 px-4 py-3 text-sm text-red-900" role="alert">{error}</p>}
      <button className="btn-gold w-full" disabled={busy}>
        {busy ? 'Creating account…' : isSupplier ? 'Submit for review' : 'Create account'}
      </button>
      <p className="text-center text-sm text-stone">
        {isSupplier ? (
          <>Already registered? <Link href="/login/" className="text-moss underline underline-offset-4">Sign in</Link></>
        ) : (
          <>Already have an account? <Link href="/login/" className="text-moss underline underline-offset-4">Sign in</Link></>
        )}
      </p>
    </form>
  );
}
