import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { loadBooking } from "@/lib/booking-queries";
import { BookingActions } from "@/components/BookingActions";

export const dynamic = "force-dynamic";

export const metadata = { title: "Booking details", robots: { index: false } };

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/dashboard`);
  const { ref } = await params;
  const db = getDb();

  let booking: any;
  try {
    booking = loadBooking(ref, user);
  } catch {
    notFound();
  }

  const spa = db.prepare("SELECT * FROM spas WHERE id = ?").get(booking.spa_id) as any;
  const treatment = db.prepare("SELECT * FROM treatments WHERE id = ?").get(booking.treatment_id) as any;
  const therapist = booking.therapist_id
    ? db.prepare("SELECT name FROM therapists WHERE id = ?").get(booking.therapist_id) as any
    : null;
  const branch = db.prepare("SELECT name FROM branches WHERE id = ?").get(booking.branch_id) as any;
  const payment = db.prepare("SELECT * FROM payments WHERE booking_id = ? ORDER BY id DESC LIMIT 1").get(booking.id) as any;
  const events = db
    .prepare("SELECT * FROM booking_events WHERE booking_id = ? ORDER BY id")
    .all(booking.id) as any[];
  const review = db.prepare("SELECT * FROM reviews WHERE booking_id = ?").get(booking.id) as any;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <nav className="text-xs text-ink-soft" aria-label="Breadcrumb">
        <Link href="/dashboard">Dashboard</Link> / <span>Booking {booking.ref}</span>
      </nav>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Booking</p>
          <h1 className="font-display text-3xl font-bold">{booking.ref}</h1>
        </div>
        <span className="badge bg-jade text-white">{booking.status.replace("_", " ")}</span>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <div className="card p-5">
            <h2 className="font-display text-lg font-bold">Treatment details</h2>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div><dt className="text-ink-soft">Spa</dt><dd className="font-semibold">{spa.name}{branch ? ` · ${branch.name}` : ""}</dd></div>
              <div><dt className="text-ink-soft">Address</dt><dd>{spa.address || spa.city}</dd></div>
              <div><dt className="text-ink-soft">Treatment</dt><dd className="font-semibold">{treatment.name}</dd></div>
              <div><dt className="text-ink-soft">Duration</dt><dd>{booking.duration_min} min</dd></div>
              <div><dt className="text-ink-soft">Date</dt><dd className="font-semibold">{booking.booking_date}</dd></div>
              <div><dt className="text-ink-soft">Time</dt><dd className="font-semibold">{booking.start_time}</dd></div>
              <div><dt className="text-ink-soft">Guests</dt><dd>{booking.guests}</dd></div>
              <div><dt className="text-ink-soft">Therapist</dt><dd>{therapist?.name || (booking.therapist_preference === "any" ? "Any available" : "—")}</dd></div>
              <div><dt className="text-ink-soft">Service</dt><dd>{booking.service_type === "in_spa" ? "At spa" : "Doorstep"}</dd></div>
              {booking.address && <div className="sm:col-span-2"><dt className="text-ink-soft">Your address</dt><dd>{booking.address}</dd></div>}
            </dl>
          </div>

          <div className="card p-5">
            <h2 className="font-display text-lg font-bold">Payment</h2>
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-ink-soft">Subtotal</dt><dd>{booking.currency} {booking.subtotal.toLocaleString()}</dd></div>
              {booking.discount > 0 && <div className="flex justify-between text-jade"><dt>Discount</dt><dd>− {booking.currency} {booking.discount.toLocaleString()}</dd></div>}
              {booking.travel_fee > 0 && <div className="flex justify-between"><dt className="text-ink-soft">Travel fee</dt><dd>{booking.currency} {booking.travel_fee.toLocaleString()}</dd></div>}
              {booking.service_fee > 0 && <div className="flex justify-between"><dt className="text-ink-soft">Service fee</dt><dd>{booking.currency} {booking.service_fee.toLocaleString()}</dd></div>}
              {booking.tax > 0 && <div className="flex justify-between"><dt className="text-ink-soft">Tax</dt><dd>{booking.currency} {booking.tax.toLocaleString()}</dd></div>}
              <div className="flex justify-between border-t border-[#e8e2d3] pt-2 text-base font-bold"><dt>Total</dt><dd className="text-jade">{booking.currency} {booking.total.toLocaleString()}</dd></div>
            </dl>
            {payment && (
              <div className="mt-3 rounded-lg bg-cream p-3 text-xs text-ink-soft">
                Payment: <strong>{payment.status}</strong> via {payment.method} · {payment.provider}
                {payment.transaction_id && ` · ${payment.transaction_id}`}
              </div>
            )}
            <div className="mt-3 rounded-lg border border-dashed border-jade p-3 text-sm">
              <div className="eyebrow">Voucher</div>
              <div className="font-display text-lg font-bold">{booking.ref}</div>
              <div className="text-xs text-ink-soft">{booking.cancel_policy}</div>
            </div>
          </div>

          <div className="card p-5">
            <h2 className="font-display text-lg font-bold">Status history</h2>
            <ol className="mt-3 space-y-2 text-sm">
              {events.map((e, i) => (
                <li key={i} className="flex gap-3">
                  <span className="text-ink-soft">{new Date(e.created_at).toLocaleString()}</span>
                  <span className="font-semibold">{e.from_status ? `${e.from_status} → ` : ""}{e.to_status}</span>
                  {e.note && <span className="text-ink-soft">— {e.note}</span>}
                </li>
              ))}
            </ol>
          </div>
        </div>

        <aside className="space-y-5">
          <BookingActions booking={booking} hasReview={!!review} />
          {review && (
            <div className="card p-5">
              <div className="eyebrow mb-1">Your review</div>
              <div className="text-gold-deep">{"★".repeat(review.rating)}</div>
              <p className="mt-1 text-sm text-ink-soft">{review.body}</p>
            </div>
          )}
          <div className="card p-5 text-sm">
            <div className="eyebrow mb-2">Cancellation policy</div>
            <p className="text-ink-soft">{booking.cancel_policy}</p>
            <Link href={`/spa/${spa.slug}`} className="mt-2 inline-block font-semibold text-jade hover:underline">
              View spa →
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
