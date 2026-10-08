"use client";

import { useEffect, useState } from "react";

/** Admin booking management: search, status actions, refunds. */
export function AdminBookings() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    const res = await fetch(`/api/admin/bookings?${params}`, { cache: "no-store" });
    const d = await res.json();
    setRows(d?.data?.bookings ?? []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);

  const act = async (bookingRef: string, action: string) => {
    if (action === "refund" && !confirm(`Refund booking ${bookingRef}?`)) return;
    if (action === "cancel" && !confirm(`Cancel booking ${bookingRef}?`)) return;
    setErr(null); setMsg(null);
    const res = await fetch("/api/admin/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingRef, action, reason: `Admin ${action}` }),
    });
    const d = await res.json();
    if (!d.ok) { setErr(d.error || "Action failed"); return; }
    setMsg(`${action} — done`);
    load();
  };

  return (
    <div className="mt-6">
      <div className="flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="Search ref / customer…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} aria-label="Search bookings" />
        <select className="input max-w-[180px]" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter">
          <option value="">All statuses</option>
          {["pending", "payment_pending", "confirmed", "voucher_issued", "in_treatment", "completed", "cancelled", "refunded", "no_show"].map((s) => (
            <option key={s} value={s}>{s.replace("_", " ")}</option>
          ))}
        </select>
        <button className="btn btn-outline text-xs" onClick={load}>Search</button>
      </div>
      {msg && <p className="mt-3 rounded bg-jade-pale p-2 text-sm text-jade">{msg}</p>}
      {err && <p className="mt-3 rounded bg-[#f7e5e3] p-2 text-sm text-danger">{err}</p>}

      <div className="card mt-4 overflow-x-auto">
        <table className="table-spa">
          <thead>
            <tr><th>Ref</th><th>Customer</th><th>Spa</th><th>Treatment</th><th>When</th><th>Total</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id}>
                <td className="font-mono text-xs">{b.ref}</td>
                <td>{b.customer_name}<br /><span className="text-xs text-ink-soft">{b.customer_email}</span></td>
                <td>{b.spa_name}</td>
                <td>{b.treatment_name}</td>
                <td className="whitespace-nowrap text-xs">{b.booking_date} {b.start_time}</td>
                <td className="whitespace-nowrap">{b.currency} {b.total.toLocaleString()}</td>
                <td><span className="badge bg-cream-deep text-ink-soft">{b.status.replace("_", " ")}</span></td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {["pending", "payment_pending"].includes(b.status) && (
                      <button className="chip !py-0.5 !text-[0.65rem] chip-active" onClick={() => act(b.ref, "confirm")}>Confirm</button>
                    )}
                    {["confirmed", "voucher_issued"].includes(b.status) && (
                      <>
                        <button className="chip !py-0.5 !text-[0.65rem]" onClick={() => act(b.ref, "complete")}>Complete</button>
                        <button className="chip !py-0.5 !text-[0.65rem]" onClick={() => act(b.ref, "cancel")}>Cancel</button>
                      </>
                    )}
                    {b.payment_status === "paid" && !["refunded"].includes(b.status) && (
                      <button className="chip !py-0.5 !text-[0.65rem] !border-danger !text-danger" onClick={() => act(b.ref, "refund")}>Refund</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="text-center text-ink-soft">No bookings found.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
