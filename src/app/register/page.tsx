"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ fullName: "", email: "", password: "", phone: "", country: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const d = await res.json();
    setBusy(false);
    if (!d.ok) { setError(d.error || "Registration failed"); return; }
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <p className="eyebrow">Join Book Your Spa</p>
      <h1 className="font-display mt-1 text-3xl font-bold">Create your account</h1>
      <form onSubmit={submit} className="card mt-5 space-y-4 p-6">
        {error && <p className="rounded-lg bg-[#f7e5e3] p-3 text-sm text-danger">{error}</p>}
        <div>
          <label className="label" htmlFor="name">Full name</label>
          <input id="name" className="input" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required minLength={2} />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required autoComplete="email" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password (min 8 chars)</label>
          <input id="password" type="password" className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} autoComplete="new-password" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="phone">Phone</label>
            <input id="phone" className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="country">Country</label>
            <input id="country" className="input" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
          </div>
        </div>
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
        <p className="text-center text-sm text-ink-soft">
          Already registered? <Link href="/login" className="text-jade hover:underline">Log in</Link>
        </p>
      </form>
      <p className="mt-4 text-center text-sm text-ink-soft">
        Are you a spa owner? <Link href="/list-your-spa" className="font-semibold text-jade hover:underline">List your spa →</Link>
      </p>
    </div>
  );
}
