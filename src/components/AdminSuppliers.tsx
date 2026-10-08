"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Admin supplier approval queue: approve / reject / request changes / suspend / unpublish. */
export function AdminSuppliers() {
  const router = useRouter();
  const [rows, setRows] = useState<any[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch("/api/admin/suppliers", { cache: "no-store" });
    const d = await res.json();
    setRows(d?.data?.suppliers ?? []);
  };
  useEffect(() => { load(); }, []);

  const act = async (supplierId: number, action: string) => {
    const reason = action === "reject" || action === "request_changes" ? prompt("Reason (shown to supplier):") || undefined : undefined;
    setErr(null); setMsg(null);
    const res = await fetch("/api/admin/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplierId, action, reason }),
    });
    const d = await res.json();
    if (!d.ok) { setErr(d.error || "Action failed"); return; }
    setMsg(`${action} — done`);
    load();
    router.refresh();
  };

  const badge = (s: string) =>
    s === "approved" ? "bg-jade-pale text-jade"
    : s === "pending" ? "bg-[#fdf1d7] text-gold-deep"
    : s === "suspended" || s === "rejected" ? "bg-[#f7e5e3] text-danger"
    : "bg-cream-deep text-ink-soft";

  return (
    <div className="mt-6">
      {msg && <p className="mb-3 rounded bg-jade-pale p-2 text-sm text-jade">{msg}</p>}
      {err && <p className="mb-3 rounded bg-[#f7e5e3] p-2 text-sm text-danger">{err}</p>}
      <div className="card overflow-x-auto">
        <table className="table-spa">
          <thead>
            <tr><th>Business</th><th>Contact</th><th>Status</th><th>Spas</th><th>Submitted</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td className="font-semibold">{s.business_name}</td>
                <td>{s.full_name}<br /><span className="text-xs text-ink-soft">{s.email}</span></td>
                <td><span className={`badge ${badge(s.status)}`}>{s.status.replace("_", " ")}</span></td>
                <td>{s.spa_count}</td>
                <td className="text-xs">{s.submitted_at ? new Date(s.submitted_at).toLocaleDateString() : "—"}</td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {s.status !== "approved" && <button className="chip !py-0.5 !text-[0.65rem] chip-active" onClick={() => act(s.id, "approve")}>Approve</button>}
                    {s.status === "approved" && <button className="chip !py-0.5 !text-[0.65rem]" onClick={() => act(s.id, "suspend")}>Suspend</button>}
                    {s.status === "approved" && <button className="chip !py-0.5 !text-[0.65rem]" onClick={() => act(s.id, "unpublish")}>Unpublish</button>}
                    {["pending", "changes_requested"].includes(s.status) && (
                      <>
                        <button className="chip !py-0.5 !text-[0.65rem]" onClick={() => act(s.id, "request_changes")}>Request changes</button>
                        <button className="chip !py-0.5 !text-[0.65rem]" onClick={() => act(s.id, "reject")}>Reject</button>
                      </>
                    )}
                    {["suspended", "rejected", "unpublished"].includes(s.status) && (
                      <button className="chip !py-0.5 !text-[0.65rem]" onClick={() => act(s.id, "reactivate")}>Reactivate</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="text-center text-ink-soft">No suppliers yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
