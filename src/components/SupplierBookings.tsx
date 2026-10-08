"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Supplier booking management: day/week list, filters and actions
 * (confirm / start / complete / cancel / no-show / assign / reschedule).
 */
export function SupplierBookings({ spaId }: { spaId: number }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rescheduleRef, setRescheduleRef] = useState<string | null>(null);
  const [newDate, setNewDate] = useState(today);
  const [newTime, setNewTime] = useState("10:00");

  const load = async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (date) qs.set("date", date);
    if (status) qs.set("status", status);
    const res = await fetch(`/api/supplier/bookings?${qs}`, { cache: "no-store" });
    const d = await res.json();
    setRows(d?.data?.bookings ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, status]);

  const act = async (bookingRef: string, action: string, extra: any = {}) => {
    setErr(null);
    setMsg(null);
    const res = await fetch("/api/supplier/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, bookingRef, ...extra }),
    });
    const d = await res.json();
    if (!d.ok) { setErr(d.error || "Action failed"); return; }
    setMsg(`${action} — ok`);
    setRescheduleRef(null);
    load();
    router.refresh();
  };

  const actionsFor = (b: any): [string, string][] => {
    const list: [string, string][] = [];
    if (["pending", "payment_pending"].includes(b.status)) list.push(["confirm", "Confirm"]);
    if (["confirmed", "voucher_issued"].includes(b.status)) {
      list.push(["start", "Start"]);
      list.push(["reschedule", "Reschedule"]);
    }
    if (b.status === "in_treatment") list.push(["complete", "Complete"]);
    if (!["completed", "cancelled", "refunded", "no_show"].includes(b.status)) {
      list.push(["no_show", "No-show"]);
      list.push(["cancel", "Cancel"]);
    }
    return list;
  };

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="sb-date">Day</label>
          <input id="sb-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="sb-status">Status</label>
          <select id="sb-status" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            {["pending", "payment_pending", "confirmed", "voucher_issued", "in_treatment", "completed", "cancelled", "no_show"].map((s) => (
              <option key={s} value={s}>{s.replace("_", " ")}</option>
            ))}
          </select>
        </div>
        <button className="btn btn-outline text-xs" onClick={() => { setDate(""); setStatus(""); }}>All bookings</button>
      </div>

      {msg && <p className="mt-3 rounded bg-jade-pale p-2 text-sm text-jade">{msg}</p>}
      {err && <p className="mt-3 rounded bg-[#f7e5e3] p-2 text-sm text-danger">{err}</p>}

      <div className="card mt-4 overflow-x-auto">
        <table className="table-spa">
          <thead>
            <tr>
              <th>Ref</th><th>When</th><th>Customer</th><th>Treatment</th><th>Therapist</th>
              <th>Guests</th><th>Total</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="text-center text-ink-soft">Loading…</td></tr>}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={9} className="text-center text-ink-soft">No bookings for this filter.</td></tr>
            )}
            {rows.map((b) => (
              <tr key={b.id}>
                <td className="font-mono text-xs">{b.ref}</td>
                <td>{b.booking_date}<br /><span className="text-ink-soft">{b.start_time}</span></td>
                <td>{b.customer_name}<br /><span className="text-xs text-ink-soft">{b.customer_phone || b.customer_email}</span></td>
                <td>{b.treatment_name}</td>
                <td>{b.therapist_name || "—"}</td>
                <td>{b.guests}</td>
                <td className="whitespace-nowrap">{b.currency} {b.total.toLocaleString()}</td>
                <td><span className="badge bg-cream-deep text-ink-soft">{b.status.replace("_", " ")}</span></td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {actionsFor(b).map(([a, label]) => (
                      a === "reschedule" ? (
                        <button key={a} className="chip !py-0.5 !text-[0.65rem]" onClick={() => setRescheduleRef(b.ref)}>{label}</button>
                      ) : (
                        <button
                          key={a}
                          className="chip !py-0.5 !text-[0.65rem]"
                          onClick={() => act(b.ref, a, a === "cancel" ? { note: "Cancelled by spa" } : {})}
                        >
                          {label}
                        </button>
                      )
                    ))}
                  </div>
                  {rescheduleRef === b.ref && (
                    <div className="mt-1 flex gap-1">
                      <input type="date" className="input !w-auto !py-1 !text-xs" value={newDate} onChange={(e) => setNewDate(e.target.value)} aria-label="New date" />
                      <input type="time" className="input !w-auto !py-1 !text-xs" value={newTime} onChange={(e) => setNewTime(e.target.value)} aria-label="New time" />
                      <button className="chip chip-active !py-0.5 !text-[0.65rem]" onClick={() => act(b.ref, "reschedule", { date: newDate, time: newTime })}>Move</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink-soft">spaId {spaId} · reschedule re-checks therapist &amp; room availability server-side.</p>
    </div>
  );
}
