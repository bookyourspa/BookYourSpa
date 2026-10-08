"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const d = await res.json();
    setBusy(false);
    if (!d.ok) { setError(d.error || "Login failed"); return; }
    const role = d.data.role;
    router.push(role === "admin" ? "/admin" : role === "supplier" ? "/supplier" : next);
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <p className="eyebrow">Welcome back</p>
      <h1 className="font-display mt-1 text-3xl font-bold">Log in</h1>
      <form onSubmit={submit} className="card mt-5 space-y-4 p-6">
        {error && <p className="rounded-lg bg-[#f7e5e3] p-3 text-sm text-danger">{error}</p>}
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </div>
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? "Logging in…" : "Log in"}</button>
        <div className="flex justify-between text-sm">
          <Link href="/forgot-password" className="text-jade hover:underline">Forgot password?</Link>
          <Link href="/register" className="text-jade hover:underline">Create account</Link>
        </div>
      </form>

      <div className="card mt-4 p-5 text-sm">
        <div className="eyebrow mb-2">Demo accounts (password: Demo123!)</div>
        <ul className="space-y-1 text-ink-soft">
          <li>Customer — <button className="text-jade hover:underline" onClick={() => { setEmail("customer@demo.test"); setPassword("Demo123!"); }}>customer@demo.test</button></li>
          <li>Supplier — <button className="text-jade hover:underline" onClick={() => { setEmail("supplier@demo.test"); setPassword("Demo123!"); }}>supplier@demo.test</button></li>
          <li>Admin — <button className="text-jade hover:underline" onClick={() => { setEmail("admin@demo.test"); setPassword("Demo123!"); }}>admin@demo.test</button></li>
          <li>Therapist — <button className="text-jade hover:underline" onClick={() => { setEmail("therapist@demo.test"); setPassword("Demo123!"); }}>therapist@demo.test</button></li>
        </ul>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
