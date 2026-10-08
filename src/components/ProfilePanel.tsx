"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ProfilePanel({ user }: { user: any }) {
  const router = useRouter();
  const [form, setForm] = useState({
    fullName: user.full_name || "",
    phone: user.phone || "",
    whatsapp: user.whatsapp || "",
    country: user.country || "",
    email: user.email,
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const d = await res.json();
    setBusy(false);
    setMsg(d.ok ? "Profile saved." : d.error || "Save failed");
    if (d.ok) router.refresh();
  };

  return (
    <form onSubmit={submit} className="card mt-6 max-w-lg space-y-4 p-6">
      {msg && <p className="rounded-lg bg-jade-pale p-3 text-sm text-jade">{msg}</p>}
      <div>
        <label className="label" htmlFor="p-name">Full name</label>
        <input id="p-name" className="input" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
      </div>
      <div>
        <label className="label" htmlFor="p-email">Email</label>
        <input id="p-email" className="input bg-cream-deep" value={form.email} disabled />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="p-phone">Phone</label>
          <input id="p-phone" className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="p-wa">WhatsApp</label>
          <input id="p-wa" className="input" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="p-country">Country</label>
        <input id="p-country" className="input" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
      </div>
      <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save profile"}</button>
    </form>
  );
}
