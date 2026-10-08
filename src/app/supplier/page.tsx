import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireSupplierSpa } from "@/lib/supplier";
import { releaseExpiredHolds } from "@/lib/booking";
import { SupplierBookings } from "@/components/SupplierBookings";
import { SupplierCatalog } from "@/components/SupplierCatalog";

export const dynamic = "force-dynamic";

export const metadata = { title: "Supplier dashboard", robots: { index: false } };

export default async function SupplierPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/supplier");
  if (user.role === "admin") redirect("/admin");
  if (user.role !== "supplier") redirect("/list-your-spa");

  const { tab = "overview" } = await searchParams;
  releaseExpiredHolds();
  const db = getDb();

  const supplier = db.prepare("SELECT * FROM suppliers WHERE user_id = ?").get(user.id) as any;
  if (!supplier) redirect("/list-your-spa");

  let spa: any = null;
  try {
    spa = requireSupplierSpa(user);
  } catch {
    spa = null;
  }

  const tabs = [
    ["overview", "Overview"],
    ["calendar", "Bookings"],
    ["catalog", "Treatments"],
    ["therapists", "Therapists"],
    ["finance", "Finance"],
    ["profile", "Profile"],
  ];

  // Approval gate
  if (supplier.status !== "approved") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="eyebrow">Supplier area</p>
        <h1 className="font-display mt-2 text-3xl font-bold">{supplier.business_name}</h1>
        <div className="card mt-6 p-8">
          <span className={`badge ${supplier.status === "pending" ? "bg-[#fdf1d7] text-gold-deep" : "bg-[#f7e5e3] text-danger"}`}>
            {supplier.status.replace("_", " ")}
          </span>
          <p className="mt-3 text-ink-soft">
            {supplier.status === "pending"
              ? "Your application is under admin review. You'll be notified as soon as it's approved — then you can publish your spa."
              : supplier.status === "changes_requested"
              ? `Please update your application: ${supplier.status_reason || "see admin feedback"}`
              : supplier.status === "suspended"
              ? "This account is suspended. Contact support."
              : "Your application was not approved. Contact support for details."}
          </p>
          {supplier.status === "changes_requested" && (
            <Link href="/list-your-spa" className="btn btn-primary mt-4">Update application</Link>
          )}
        </div>
      </div>
    );
  }

  if (!spa) redirect("/list-your-spa?step=profile");

  // Stats
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + "01";
  const active = "('pending','payment_pending','confirmed','voucher_issued','in_treatment')";
  const q = (sql: string, ...p: any[]) => (db.prepare(sql).get(...p) as any);
  const stats = {
    today: q(`SELECT COUNT(*) c FROM bookings WHERE spa_id = ? AND booking_date = ? AND status IN ${active}`, spa.id, today).c,
    upcoming: q(`SELECT COUNT(*) c FROM bookings WHERE spa_id = ? AND booking_date >= ? AND status IN ('confirmed','voucher_issued')`, spa.id, today).c,
    pending: q(`SELECT COUNT(*) c FROM bookings WHERE spa_id = ? AND status IN ('pending','payment_pending')`, spa.id).c,
    todayRevenue: q(`SELECT COALESCE(SUM(total),0) c FROM bookings WHERE spa_id = ? AND booking_date = ? AND status IN ('confirmed','voucher_issued','in_treatment','completed')`, spa.id, today).c,
    monthRevenue: q(`SELECT COALESCE(SUM(total),0) c FROM bookings WHERE spa_id = ? AND booking_date >= ? AND status IN ('confirmed','voucher_issued','in_treatment','completed')`, spa.id, monthStart).c,
    completed: q(`SELECT COUNT(*) c FROM bookings WHERE spa_id = ? AND status = 'completed'`, spa.id).c,
    cancelled: q(`SELECT COUNT(*) c FROM bookings WHERE spa_id = ? AND status = 'cancelled'`, spa.id).c,
    noShows: q(`SELECT COUNT(*) c FROM bookings WHERE spa_id = ? AND status = 'no_show'`, spa.id).c,
    treatments: q(`SELECT COUNT(*) c FROM treatments WHERE spa_id = ? AND status = 'active'`, spa.id).c,
    therapists: q(`SELECT COUNT(*) c FROM therapists WHERE spa_id = ? AND status = 'active'`, spa.id).c,
  };
  const finance = db.prepare(
    `SELECT COALESCE(SUM(gross),0) gross, COALESCE(SUM(amount),0) commission, COALESCE(SUM(net),0) net,
            SUM(CASE WHEN status='settled' THEN net ELSE 0 END) settled
       FROM commissions WHERE supplier_id = ?`
  ).get(supplier.id) as any;
  const rooms = q(`SELECT COUNT(*) c FROM rooms r JOIN branches b ON b.id = r.branch_id WHERE b.spa_id = ? AND r.status='active'`, spa.id).c;
  const roomsBusy = q(`SELECT COUNT(DISTINCT room_id) c FROM bookings WHERE spa_id = ? AND booking_date = ? AND status IN ${active} AND room_id IS NOT NULL`, spa.id, today).c;
  const thBusy = q(`SELECT COUNT(DISTINCT therapist_id) c FROM bookings WHERE spa_id = ? AND booking_date = ? AND status IN ${active} AND therapist_id IS NOT NULL`, spa.id, today).c;
  const pendingPayout = Math.max(0, finance.net - (finance.settled || 0));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Supplier dashboard</p>
          <h1 className="font-display mt-1 text-3xl font-bold">{spa.name}</h1>
        </div>
        <Link href={`/spa/${spa.slug}`} className="btn btn-outline text-xs">View public page →</Link>
      </div>

      <nav className="mt-4 flex flex-wrap gap-2" aria-label="Supplier tabs">
        {tabs.map(([k, l]) => (
          <Link key={k} href={`/supplier?tab=${k}`} className={`chip ${tab === k ? "chip-active" : ""}`}>{l}</Link>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Today's bookings", stats.today],
              ["Upcoming", stats.upcoming],
              ["Pending", stats.pending],
              ["Completed", stats.completed],
              ["Today's revenue", `${spa.currency || "IDR"}`],
              ["Month revenue", stats.monthRevenue.toLocaleString()],
              ["Cancelled", stats.cancelled],
              ["No-shows", stats.noShows],
            ].map(([l, v], i) => (
              <div key={l as string} className="card p-4">
                <div className="text-xs text-ink-soft">{l}</div>
                <div className="font-display text-2xl font-bold text-jade">
                  {i === 4 ? stats.todayRevenue.toLocaleString() : v}
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="card p-5">
              <div className="eyebrow">Therapist utilization today</div>
              <div className="mt-2 font-display text-3xl font-bold text-jade">{stats.therapists ? Math.round((thBusy / stats.therapists) * 100) : 0}%</div>
              <p className="text-sm text-ink-soft">{thBusy} of {stats.therapists} therapists in treatment</p>
            </div>
            <div className="card p-5">
              <div className="eyebrow">Room occupancy today</div>
              <div className="mt-2 font-display text-3xl font-bold text-jade">{rooms ? Math.round((roomsBusy / rooms) * 100) : 0}%</div>
              <p className="text-sm text-ink-soft">{roomsBusy} of {rooms} rooms in use</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="card p-5"><div className="text-xs text-ink-soft">Gross sales</div><div className="font-display text-2xl font-bold">{finance.gross.toLocaleString()}</div></div>
            <div className="card p-5"><div className="text-xs text-ink-soft">Platform commission</div><div className="font-display text-2xl font-bold text-danger">− {finance.commission.toLocaleString()}</div></div>
            <div className="card p-5"><div className="text-xs text-ink-soft">Pending payout</div><div className="font-display text-2xl font-bold text-jade">{pendingPayout.toLocaleString()}</div></div>
          </div>
        </div>
      )}

      {tab === "calendar" && <SupplierBookings spaId={spa.id} />}

      {(tab === "catalog" || tab === "therapists") && (
        <SupplierCatalog spaId={spa.id} initialTab={tab} />
      )}

      {tab === "finance" && (
        <div className="mt-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-4">
            {[
              ["Gross sales", finance.gross],
              ["Commission", finance.commission],
              ["Net revenue", finance.net],
              ["Pending payout", pendingPayout],
            ].map(([l, v]) => (
              <div key={l as string} className="card p-4">
                <div className="text-xs text-ink-soft">{l}</div>
                <div className="font-display text-xl font-bold text-jade">{(v as number).toLocaleString()}</div>
              </div>
            ))}
          </div>
          <div className="card p-5 text-sm text-ink-soft">
            Payouts are processed by the platform finance team. Settlement periods and payout status
            are visible here once processed.
          </div>
        </div>
      )}

      {tab === "profile" && (
        <div className="mt-6">
          <SupplierProfileForm spa={spa} supplier={supplier} />
        </div>
      )}
    </div>
  );
}

function SupplierProfileForm({ spa, supplier }: { spa: any; supplier: any }) {
  return (
    <div className="card max-w-2xl p-6">
      <h2 className="font-display text-lg font-bold">Business profile</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Editing your profile keeps it visible if already published; new submissions go to admin review.
        Use the API (<code>POST /api/supplier/spa</code>) or the catalog screens for treatments &amp; therapists.
      </p>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between"><dt className="text-ink-soft">Business</dt><dd className="font-semibold">{supplier.business_name}</dd></div>
        <div className="flex justify-between"><dt className="text-ink-soft">Spa</dt><dd className="font-semibold">{spa.name}</dd></div>
        <div className="flex justify-between"><dt className="text-ink-soft">Status</dt><dd><span className="badge bg-jade-pale text-jade">{spa.status}</span></dd></div>
        <div className="flex justify-between"><dt className="text-ink-soft">City</dt><dd>{spa.city || "—"}</dd></div>
        <div className="flex justify-between"><dt className="text-ink-soft">Commission rate</dt><dd>{supplier.commission_rate ?? "default"}%</dd></div>
      </dl>
    </div>
  );
}
