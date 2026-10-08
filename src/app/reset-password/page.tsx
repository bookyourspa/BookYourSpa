"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function ResetForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const token = sp.get("token") || "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/forgot-password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const d = await res.json();
    setBusy(false);
    if (!d.ok) { setError(d.error || "Reset failed"); return; }
    setDone(true);
    setTimeout(() => router.push("/login"), 1500);
  };

  if (!token) return <p className="mt-6 text-sm text-danger">This reset link is missing its token.</p>;

  return (
    <form onSubmit={submit} className="card mt-5 space-y-4 p-6">
      {error && <p className="rounded-lg bg-[#f7e5e3] p-3 text-sm text-danger">{error}</p>}
      {done && <p className="rounded-lg bg-jade-pale p-3 text-sm text-jade">Password updated — redirecting to login…</p>}
      <div>
        <label className="label" htmlFor="pw">New password (min 8 chars)</label>
        <input id="pw" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
      </div>
      <button className="btn btn-primary w-full" disabled={busy}>{busy ? "Updating…" : "Set new password"}</button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <p className="eyebrow">Account recovery</p>
      <h1 className="font-display mt-1 text-3xl font-bold">Choose a new password</h1>
      <Suspense>
        <ResetForm />
      </Suspense>
    </div>
  );
}
