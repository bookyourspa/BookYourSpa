"use client";

import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => undefined);
    setBusy(false);
    setSent(true);
  };

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <p className="eyebrow">Account recovery</p>
      <h1 className="font-display mt-1 text-3xl font-bold">Reset your password</h1>
      {sent ? (
        <div className="card mt-5 p-6 text-sm text-ink-soft">
          If an account exists for <strong>{email}</strong>, a reset link has been sent.
          Check your inbox (or the email outbox in the admin panel during local testing).
        </div>
      ) : (
        <form onSubmit={submit} className="card mt-5 space-y-4 p-6">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <button className="btn btn-primary w-full" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
        </form>
      )}
    </div>
  );
}
