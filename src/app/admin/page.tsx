import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, can } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { releaseExpiredHolds } from "@/lib/booking";
import { AdminSuppliers } from "@/components/AdminSuppliers";
import { AdminBookings } from "@/components/AdminBookings";
import { AdminSettlements } from "@/components/AdminSettlements";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin", robots: { index: false } };

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  if (user.role !== "admin") redirect("/dashboard");

  const { tab = "overview" } = await searchParams;
  releaseExpiredHolds();
  const db = getDb();
  const one = (sql: string) => (db.prepare(sql).get() as any)?.c ?? 0;

  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + "01";
  const revenue = db.prepare(
    `SELECT COALESCE(SUM(total),0) gross FROM bookings WHERE status IN ('confirmed','voucher_issued','in_treatment','completed')`
  ).get() as any;
  const commission = db.prepare(`SELECT COALESCE(SUM(amount),0) c FROM commissions`).get() as any;
  const refunds = db.prepare(`SELECT COALESCE(SUM(amount),0) c FROM refunds WHERE status='processed'`).get() as any;

  const tabs = [
    ["overview", "Overview"],
    ["suppliers", "Suppliers"],
    ["bookings", "Bookings"],
    ["finance", "Finance"],
    ["audit", "Audit log"],
  ];

  const stats = {
    customers: one(`SELECT COUNT(*) c FROM users WHERE role='customer'`),
    suppliersPending: one(`SELECT COUNT(*) c FROM suppliers WHERE status IN ('pending','changes_requested')`),
    suppliersActive: one(`SELECT COUNT(*) c FROM suppliers WHERE status='approved'`),
    spasPublished: one(`SELECT COUNT(*) c FROM spas WHERE status='published'`),
    bookingsToday: one(`SELECT COUNT(*) c FROM bookings WHERE booking_date='${today}'`),
    bookingsTotal: one(`SELECT COUNT(*) c FROM bookings`),
    monthBookings: one(`SELECT COUNT(*) c FROM bookings WHERE booking_date>='${monthStart}'`),
    cancellations: one(`SELECT COUNT(*) c FROM bookings WHERE status='cancelled'`),
    reviews: one(`SELECT COUNT(*) c FROM reviews WHERE status='published'`),
  };

  const topSpas = db.prepare(
    `SELECT s.name, COUNT(b.id) bookings, COALESCE(SUM(b.total),0) revenue
       FROM bookings b JOIN spas s ON s.id = b.spa_id
      WHERE b.status IN ('confirmed','voucher_issued','in_treatment','completed')
      GROUP BY s.id ORDER BY revenue DESC LIMIT 5`
  ).all() as any[];
  const topTreatments = db.prepare(
    `SELECT t.name, COUNT(b.id) bookings FROM bookings b JOIN treatments t ON t.id = b.treatment_id
      WHERE b.status IN ('confirmed','voucher_issued','in_treatment','completed')
      GROUP BY t.id ORDER BY bookings DESC LIMIT 5`
  ).all() as any[];
  const topDestinations = db.prepare(
    `SELECT COALESCE(s.city,'Unknown') city, COUNT(b.id) bookings FROM bookings b JOIN spas s ON s.id = b.spa_id
      WHERE b.status IN ('confirmed','voucher_issued','in_treatment','completed')
      GROUP BY s.city ORDER BY bookings DESC LIMIT 5`
  ).all() as any[];

  const audit = db.prepare(
    `SELECT a.*, u.email user_email FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
      ORDER BY a.created_at DESC LIMIT 25`
  ).all() as any[];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <p className="eyebrow">Platform administration</p>
      <h1 className="font-display mt-1 text-3xl font-bold">Admin dashboard</h1>
      <p className="text-sm text-ink-soft">Signed in as {user.email} · {user.admin_level || "admin"}</p>

      <nav className="mt-4 flex flex-wrap gap-2" aria-label="Admin tabs">
        {tabs.map(([k, l]) => (
          <Link key={k} href={`/admin?tab=${k}`} className={`chip ${tab === k ? "chip-active" : ""}`}>{l}</Link>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Customers", stats.customers],
              ["Active suppliers", stats.suppliersActive],
              ["Pending suppliers", stats.suppliersPending],
              ["Published spas", stats.spasPublished],
              ["Bookings today", stats.bookingsToday],
              ["Bookings total", stats.bookingsTotal],
              ["Cancellations", stats.cancellations],
              ["Published reviews", stats.reviews],
            ].map(([l, v]) => (
              <div key={l as string} className="card p-4">
                <div className="text-xs text-ink-soft">{l}</div>
                <div className="font-display text-2xl font-bold text-jade">{v as number}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="card p-5"><div className="text-xs text-ink-soft">Gross revenue</div><div className="font-display text-3xl font-bold">{revenue.gross.toLocaleString()}</div></div>
            <div className="card p-5"><div className="text-xs text-ink-soft">Commission earned</div><div className="font-display text-3xl font-bold text-jade">{commission.c.toLocaleString()}</div></div>
            <div className="card p-5"><div className="text-xs text-ink-soft">Refunds processed</div><div className="font-display text-3xl font-bold text-danger">{refunds.c.toLocaleString()}</div></div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {[["Top spas", topSpas.map((r) => `${r.name} — ${r.revenue.toLocaleString()}`)],
              ["Top treatments", topTreatments.map((r) => `${r.name} — ${r.bookings}`)],
              ["Top destinations", topDestinations.map((r) => `${r.city} — ${r.bookings}`)]].map(([title, items]) => (
              <div key={title as string} className="card p-5">
                <div className="eyebrow">{title as string}</div>
                <ol className="mt-2 space-y-1 text-sm text-ink-soft">
                  {(items as string[]).map((it, i) => <li key={i}>{i + 1}. {it}</li>)}
                  {(items as string[]).length === 0 && <li>No data yet.</li>}
                </ol>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "suppliers" && <AdminSuppliers />}
      {tab === "bookings" && <AdminBookings />}
      {tab === "finance" && (
        <div className="mt-6 space-y-6">
          <AdminSettlements />
        </div>
      )}

      {tab === "audit" && (
        <div className="card mt-6 overflow-x-auto">
          <table className="table-spa">
            <thead>
              <tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Details</th></tr>
            </thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap text-xs">{new Date(a.created_at).toLocaleString()}</td>
                  <td>{a.user_email || a.actor_role || "system"}</td>
                  <td className="font-mono text-xs">{a.action}</td>
                  <td>{a.entity}{a.entity_id ? ` #${a.entity_id}` : ""}</td>
                  <td className="max-w-md truncate text-xs text-ink-soft">
                    {a.before ? `${a.before} → ` : ""}{a.after || ""}
                  </td>
                </tr>
              ))}
              {audit.length === 0 && <tr><td colSpan={5} className="text-center text-ink-soft">No audit entries yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === "overview" && audit.length > 0 && (
        <div className="mt-6 card p-5">
          <div className="flex items-center justify-between">
            <div className="eyebrow">Recent activity</div>
            <Link href="/admin?tab=audit" className="text-xs font-semibold text-jade hover:underline">Full audit log →</Link>
          </div>
          <ul className="mt-2 space-y-1 text-xs text-ink-soft">
            {audit.slice(0, 8).map((a) => (
              <li key={a.id}>{new Date(a.created_at).toLocaleString()} — <span className="font-mono">{a.action}</span> {a.entity} #{a.entity_id}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
