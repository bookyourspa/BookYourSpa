"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function BookingActions({ booking, hasReview }: { booking: any; hasReview: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");

  const call = async (path: string, method: string, payload?: any) => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    const res = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const d = await res.json().catch(() => ({ ok: false, error: "Network error" }));
    setBusy(false);
    if (!d.ok) { setErr(d.error || "Action failed"); return false; }
    setMsg("Done.");
    router.refresh();
    return true;
  };

  const payNow = async () => {
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/bookings/${booking.ref}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "qris" }),
    });
    const d = await res.json().catch(() => ({ ok: false, error: "Network error" }));
    setBusy(false);
    if (!d.ok) { setErr(d.error || "Payment failed"); return; }
    setMsg("Payment received — booking confirmed!");
    router.refresh();
  };

  const cancel = async () => {
    if (!confirm("Cancel this booking?")) return;
    await call(`/api/bookings/${booking.ref}`, "POST", { reason: "Cancelled by customer" });
  };

  const submitReview = async () => {
    const ok = await call("/api/reviews", "POST", { bookingRef: booking.ref, rating, body });
    if (ok) setShowReview(false);
  };

  const payable = ["payment_pending", "pending"].includes(booking.status);
  const cancellable = ["pending", "payment_pending", "confirmed", "voucher_issued"].includes(booking.status);
  const reviewable = booking.status === "completed" && !hasReview;

  return (
    <div className="card space-y-3 p-5">
      {msg && <p className="rounded bg-jade-pale p-2 text-sm text-jade">{msg}</p>}
      {err && <p className="rounded bg-[#f7e5e3] p-2 text-sm text-danger">{err}</p>}

      {payable && (
        <div>
          <p className="text-sm text-ink-soft">
            Payment pending — your slot is held until{" "}
            {booking.hold_expires_at ? new Date(booking.hold_expires_at).toLocaleTimeString() : "10 minutes after booking"}.
          </p>
          <button className="btn btn-gold mt-2 w-full" onClick={payNow} disabled={busy}>
            {busy ? "Processing…" : `Pay ${booking.currency} ${booking.total.toLocaleString()}`}
          </button>
        </div>
      )}

      {reviewable && !showReview && (
        <button className="btn btn-primary w-full" onClick={() => setShowReview(true)}>
          ✎ Write a review
        </button>
      )}

      {showReview && (
        <div className="space-y-2">
          <div className="flex gap-1" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                onClick={() => setRating(n)}
                className={`text-2xl ${n <= rating ? "text-gold-deep" : "text-[#ddd5c2]"}`}
                aria-label={`${n} star`}
              >
                ★
              </button>
            ))}
          </div>
          <textarea
            className="input"
            rows={3}
            placeholder="How was your treatment?"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            aria-label="Review text"
          />
          <button className="btn btn-primary w-full" onClick={submitReview} disabled={busy}>
            Submit review
          </button>
        </div>
      )}

      {cancellable && (
        <button className="btn btn-outline w-full" onClick={cancel} disabled={busy}>
          Cancel booking
        </button>
      )}

      {["completed", "cancelled", "no_show"].includes(booking.status) && (
        <p className="text-center text-xs text-ink-soft">This booking is closed.</p>
      )}
    </div>
  );
}
