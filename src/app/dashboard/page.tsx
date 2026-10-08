import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { releaseExpiredHolds } from "@/lib/booking";
import { ProfilePanel } from "@/components/ProfilePanel";

export const dynamic = "force-dynamic";

export const metadata = { title: "My dashboard", robots: { index: false } };

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-[#fdf1d7] text-gold-deep",
  payment_pending: "bg-[#fdf1d7] text-gold-deep",
  confirmed: "bg-jade-pale text-jade",
  voucher_issued: "bg-jade-pale text-jade",
  in_treatment: "bg-jade-pale text-jade",
  completed: "bg-cream-deep text-ink-soft",
  cancelled: "bg-[#f7e5e3] text-danger",
  refunded: "bg-[#f7e5e3] text-danger",
  no_show: "bg-[#f7e5e3] text-danger",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard");
  const { tab = "overview" } = await searchParams;
  releaseExpiredHolds();
  const db = getDb();

  const bookings = db
    .prepare(
      `SELECT b.*, s.name spa_name, s.slug spa_slug, t.name treatment_name, t.duration_min treatment_duration
         FROM bookings b JOIN spas s ON s.id = b.spa_id JOIN treatments t ON t.id = b.treatment_id
        WHERE b.customer_id = ? ORDER BY b.booking_date DESC, b.start_time DESC`
    )
    .all(user.id) as any[];
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = bookings.filter((b) => b.booking_date >= today && ["confirmed", "voucher_issued", "payment_pending", "pending"].includes(b.status));
  const notifications = db
    .prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20")
    .all(user.id) as any[];
  const reviews = db
    .prepare(
      `SELECT r.*, t.name treatment_name FROM reviews r LEFT JOIN treatments t ON t.id = r.treatment_id
        WHERE r.customer_id = ? ORDER BY r.created_at DESC`
    )
    .all(user.id) as any[];
  const favorites = db
    .prepare(
      `SELECT DISTINCT s.id, s.slug, s.name, s.city FROM spas s
         JOIN bookings b ON b.spa_id = s.id WHERE b.customer_id = ? LIMIT 6`
    )
    .all(user.id) as any[];

  const tabs = [
    ["overview", "Overview"],
    ["bookings", "My bookings"],
    ["notifications", `Notifications`],
    ["reviews", "My reviews"],
    ["profile", "Profile"],
  ];

  const counts = {
    upcoming: upcoming.length,
    completed: bookings.filter((b) => b.status === "completed").length,
    cancelled: bookings.filter((b) => ["cancelled", "refunded"].includes(b.status)).length,
    unread: notifications.filter((n) => !n.read_at).length,
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <p className="eyebrow">Customer area</p>
      <h1 className="font-display mt-1 text-3xl font-bold">Welcome, {user.full_name.split(" ")[0]}</h1>

      <nav className="mt-4 flex flex-wrap gap-2" aria-label="Dashboard tabs">
        {tabs.map(([key, label]) => (
          <Link
            key={key}
            href={`/dashboard?tab=${key}`}
            className={`chip ${tab === key ? "chip-active" : ""}`}
          >
            {label}
            {key === "notifications" && counts.unread > 0 && (
              <span className="ml-1 rounded-full bg-danger px-1.5 text-[10px] font-bold text-white">{counts.unread}</span>
            )}
          </Link>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {[["Upcoming", counts.upcoming], ["Completed", counts.completed], ["Cancelled", counts.cancelled]].map(([l, v]) => (
              <div key={l as string} className="card p-5">
                <div className="text-sm text-ink-soft">{l}</div>
                <div className="font-display text-3xl font-bold text-jade">{v as number}</div>
              </div>
            ))}
          </div>

          <section>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold">Upcoming booking</h2>
              <Link href="/dashboard?tab=bookings" className="text-sm font-semibold text-jade hover:underline">All bookings →</Link>
            </div>
            {upcoming.length === 0 ? (
              <div className="card mt-3 p-8 text-center">
                <p className="text-ink-soft">No upcoming treatments.</p>
                <Link href="/explore" className="btn btn-primary mt-3">Find a spa</Link>
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                {upcoming.slice(0, 3).map((b) => (
                  <Link key={b.id} href={`/dashboard/bookings/${b.ref}`} className="card flex flex-wrap items-center justify-between gap-3 p-4 transition hover:border-jade">
                    <div>
                      <div className="font-semibold">{b.treatment_name} · {b.spa_name}</div>
                      <div className="text-sm text-ink-soft">{b.booking_date} at {b.start_time} · {b.guests} guest(s)</div>
                    </div>
                    <div className="text-right">
                      <span className={`badge ${STATUS_STYLE[b.status] || ""}`}>{b.status.replace("_", " ")}</span>
                      <div className="mt-1 text-sm font-bold text-jade">{b.currency} {b.total.toLocaleString()}</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {favorites.length > 0 && (
            <section>
              <h2 className="font-display text-xl font-bold">Favorite spas</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {favorites.map((f) => (
                  <Link key={f.id} href={`/spa/${f.slug}`} className="chip hover:border-jade">{f.name} · {f.city}</Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {tab === "bookings" && (
        <div className="mt-6 space-y-3">
          {bookings.length === 0 && <div className="card p-8 text-center text-ink-soft">You have no bookings yet.</div>}
          {bookings.map((b) => (
            <Link key={b.id} href={`/dashboard/bookings/${b.ref}`} className="card flex flex-wrap items-center justify-between gap-3 p-4 transition hover:border-jade">
              <div>
                <div className="font-semibold">{b.ref} · {b.treatment_name}</div>
                <div className="text-sm text-ink-soft">{b.spa_name} · {b.booking_date} {b.start_time}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`badge ${STATUS_STYLE[b.status] || ""}`}>{b.status.replace("_", " ")}</span>
                <span className="text-sm font-bold text-jade">{b.currency} {b.total.toLocaleString()}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {tab === "notifications" && (
        <div className="mt-6 space-y-2">
          {notifications.length === 0 && <div className="card p-8 text-center text-ink-soft">No notifications.</div>}
          {notifications.map((n) => (
            <div key={n.id} className={`card p-4 ${!n.read_at ? "border-l-4 border-l-jade" : ""}`}>
              <div className="flex items-center justify-between">
                <span className="font-semibold">{n.title}</span>
                <span className="text-xs text-ink-soft">{new Date(n.created_at).toLocaleString()}</span>
              </div>
              <p className="mt-1 text-sm text-ink-soft">{n.body}</p>
            </div>
          ))}
          {notifications.length > 0 && <MarkAllRead />}
        </div>
      )}

      {tab === "reviews" && (
        <div className="mt-6 space-y-3">
          {reviews.length === 0 && (
            <div className="card p-8 text-center text-ink-soft">
              You haven&apos;t reviewed a treatment yet — reviews unlock after a completed booking.
            </div>
          )}
          {reviews.map((r) => (
            <div key={r.id} className="card p-4">
              <div className="flex justify-between">
                <span className="font-semibold">{r.treatment_name}</span>
                <span className="text-gold-deep">{"★".repeat(r.rating)}</span>
              </div>
              <p className="mt-1 text-sm text-ink-soft">{r.body}</p>
              <div className="mt-1 text-xs text-ink-soft">{new Date(r.created_at).toLocaleDateString()}</div>
            </div>
          ))}
        </div>
      )}

      {tab === "profile" && <ProfilePanel user={user} />}
    </div>
  );
}

function MarkAllRead() {
  return (
    <form action={async () => {
      "use server";
      const u = await getCurrentUser();
      if (u) getDb().prepare("UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL").run(u.id);
    }}>
      <button className="btn btn-outline text-xs">Mark all as read</button>
    </form>
  );
}
