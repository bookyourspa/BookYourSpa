"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Supplier registration: creates the business account (status = pending),
 * then prompts for the spa profile. Nothing is publicly visible until an
 * admin approves the application.
 */
export default function ListYourSpaPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    businessName: "", fullName: "", email: "", password: "", phone: "", website: "", description: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/supplier/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const d = await res.json();
    setBusy(false);
    if (!d.ok) { setError(d.error || "Registration failed"); return; }
    router.push("/supplier");
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="grid gap-10 lg:grid-cols-2">
        <div>
          <p className="eyebrow">For spa &amp; wellness businesses</p>
          <h1 className="font-display mt-1 text-4xl font-bold leading-tight">
            List your spa on the world&apos;s premier wellness platform
          </h1>
          <p className="mt-4 text-ink-soft">
            Reach travellers actively searching for treatments in your destination. Manage branches,
            treatments, therapists, schedules and bookings from one dashboard — with real availability
            and secure online payments.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-ink-soft">
            {[
              "Free to join — pay only a small commission on bookings",
              "Your own booking calendar with therapist &amp; room control",
              "Doorstep / mobile service support with travel fees",
              "Promotions, reviews and revenue reporting built in",
              "Admin approval keeps quality high for every listing",
            ].map((f) => (
              <li key={f} className="flex gap-2"><span className="text-jade">✓</span>{f}</li>
            ))}
          </ul>
          <div className="card mt-6 p-5 text-sm text-ink-soft">
            New to the platform? Read the <Link href="/supplier-guide" className="font-semibold text-jade hover:underline">supplier guide</Link>.
          </div>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-6">
          <h2 className="font-display text-xl font-bold">Register your business</h2>
          {error && <p className="rounded-lg bg-[#f7e5e3] p-3 text-sm text-danger">{error}</p>}
          <div>
            <label className="label" htmlFor="biz">Business name *</label>
            <input id="biz" className="input" value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} required minLength={2} />
          </div>
          <div>
            <label className="label" htmlFor="desc">About your business</label>
            <textarea id="desc" className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="owner">Your name *</label>
            <input id="owner" className="input" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required minLength={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="email">Email *</label>
              <input id="email" type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div>
              <label className="label" htmlFor="phone">Phone / WhatsApp</label>
              <input id="phone" className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="pw">Password * (min 8 chars)</label>
            <input id="pw" type="password" className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} autoComplete="new-password" />
          </div>
          <button className="btn btn-primary w-full" disabled={busy}>
            {busy ? "Submitting…" : "Submit application"}
          </button>
          <p className="text-xs text-ink-soft">
            Your application goes to admin review — listings only publish after approval.
          </p>
        </form>
      </div>
    </div>
  );
}
