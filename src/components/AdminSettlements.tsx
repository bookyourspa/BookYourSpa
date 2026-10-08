"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Admin settlements: per-supplier payout balances + processing. */
export function AdminSettlements() {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch("/api/admin/settlements", { cache: "no-store" });
    const d = await res.json();
    setSuppliers(d?.data?.suppliers ?? []);
    setHistory(d?.data?.history ?? []);
  };
  useEffect(() => { load(); }, []);

  const payout = async (supplierId: number, name: string) => {
    if (!confirm(`Mark payout processed for ${name}? This settles all pending commissions.`)) return;
    setErr(null); setMsg(null);
    const res = await fetch("/api/admin/settlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplierId }),
    });
    const d = await res.json();
    if (!d.ok) { setErr(d.error || "Payout failed"); return; }
    setMsg(`Payout recorded: ${d.data.amount.toLocaleString()}`);
    load();
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-bold">Settlements</h2>
        <p className="text-sm text-ink-soft">Gross → commission → net → payout per supplier.</p>
        {msg && <p className="mt-2 rounded bg-jade-pale p-2 text-sm text-jade">{msg}</p>}
        {err && <p className="mt-2 rounded bg-[#f7e5e3] p-2 text-sm text-danger">{err}</p>}
        <div className="card mt-3 overflow-x-auto">
          <table className="table-spa">
            <thead>
              <tr><th>Supplier</th><th>Gross</th><th>Commission</th><th>Net</th><th>Paid</th><th>Pending payout</th><th /></tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id}>
                  <td className="font-semibold">{s.business_name}</td>
                  <td>{Number(s.gross).toLocaleString()}</td>
                  <td className="text-danger">{Number(s.commission).toLocaleString()}</td>
                  <td>{Number(s.net).toLocaleString()}</td>
                  <td className="text-jade">{Number(s.paid_out).toLocaleString()}</td>
                  <td className="font-bold text-jade">{Number(s.pendingPayout).toLocaleString()}</td>
                  <td>
                    {s.pendingPayout > 0 && (
                      <button className="chip !py-0.5 !text-[0.65rem] chip-active" onClick={() => payout(s.id, s.business_name)}>
                        Mark paid
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {suppliers.length === 0 && <tr><td colSpan={7} className="text-center text-ink-soft">No suppliers.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="font-display text-lg font-bold">Payout history</h3>
        <div className="card mt-3 overflow-x-auto">
          <table className="table-spa">
            <thead>
              <tr><th>Date</th><th>Supplier</th><th>Period</th><th>Net paid</th><th>Status</th></tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td className="text-xs">{new Date(h.created_at).toLocaleDateString()}</td>
                  <td>{h.business_name}</td>
                  <td className="text-xs">{h.period_start} → {h.period_end}</td>
                  <td>{Number(h.net).toLocaleString()}</td>
                  <td><span className="badge bg-jade-pale text-jade">{h.status}</span></td>
                </tr>
              ))}
              {history.length === 0 && <tr><td colSpan={5} className="text-center text-ink-soft">No payouts yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
