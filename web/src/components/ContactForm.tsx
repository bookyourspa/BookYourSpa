'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Field, useToast } from './ui';

export function ContactForm() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [values, setValues] = useState({ name: '', email: '', phone: '', subject: '', body: '' });
  const [touched, setTouched] = useState(false);

  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  const errors = {
    name: values.name.trim().length < 2 ? 'Please tell us your name' : '',
    email: !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email) ? 'Enter a valid email address' : '',
    body: values.body.trim().length < 5 ? 'Tell us a little more (at least 5 characters)' : '',
  };
  const valid = !errors.name && !errors.email && !errors.body;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    setBusy(true); setError(null);
    try {
      await api('/api/contact', { method: 'POST', body: values });
      setSent(true);
      toast.show('Thank you — the concierge will reply within one business hour.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send your message.');
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="card-lux p-8 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sage/25 text-xl text-moss" aria-hidden>✓</span>
        <h2 className="mt-4 font-display text-3xl">Message received</h2>
        <p className="mt-2 text-sm text-stone">We have sent a copy to {values.email}. Expect a reply within one business hour.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card-lux space-y-4 p-7" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" error={touched ? errors.name : ''}>
          <input value={values.name} onChange={set('name')} className="input-lux" autoComplete="name" />
        </Field>
        <Field label="Email" error={touched ? errors.email : ''}>
          <input value={values.email} onChange={set('email')} type="email" className="input-lux" autoComplete="email" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone (optional)">
          <input value={values.phone} onChange={set('phone')} className="input-lux" autoComplete="tel" />
        </Field>
        <Field label="Subject">
          <input value={values.subject} onChange={set('subject')} className="input-lux" placeholder="Group booking, gift voucher…" />
        </Field>
      </div>
      <Field label="How can we help?" error={touched ? errors.body : ''}>
        <textarea value={values.body} onChange={set('body')} rows={5} maxLength={3000} className="input-lux" />
      </Field>
      {error && <p className="rounded-lg bg-red-900/8 px-4 py-3 text-sm text-red-900">{error}</p>}
      <button className="btn-gold w-full sm:w-auto" disabled={busy}>{busy ? 'Sending…' : 'Send message'}</button>
      {toast.node}
    </form>
  );
}
