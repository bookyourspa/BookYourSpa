"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

interface Initial {
  treatmentId?: number;
  branchId?: number;
  date?: string;
  time?: string;
  guests?: number;
  serviceType?: "in_spa" | "doorstep";
  therapistId?: number;
}

interface Props {
  spa: any;
  branches: any[];
  treatments: any[];
  therapists: any[];
  initial: Initial;
}

const STEPS = [
  "Spa", "Treatment", "Date", "Time", "Guests",
  "Therapist", "Service", "Details", "Summary", "Payment", "Confirmed",
];

function fmtMoney(currency: string, n: number) {
  return `${currency} ${Number(n).toLocaleString()}`;
}

/** Local price mirror of the server quote (server re-computes authoritatively). */
function quote(treatment: any, guests: number, serviceType: string, promo: any) {
  const unit = Math.round(treatment.price * (1 - (treatment.discount || 0) / 100));
  const subtotal = unit * guests;
  const travelFee = serviceType === "doorstep" ? treatment.travel_fee || 0 : 0;
  let promoDiscount = 0;
  if (promo) {
    promoDiscount = promo.kind === "percent"
      ? Math.round((subtotal * promo.value) / 100)
      : Math.min(promo.value, subtotal);
  }
  return {
    unitPrice: unit,
    subtotal,
    promoDiscount,
    travelFee,
    serviceFee: 0,
    tax: 0,
    total: subtotal - promoDiscount + travelFee,
    currency: treatment.currency,
  };
}

export function BookingFlow({ spa, branches, treatments, therapists, initial }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(() => {
    if (initial.time && initial.treatmentId) return 7; // jump to details
    if (initial.treatmentId) return 2;
    return 1;
  });
  const [branchId, setBranchId] = useState(initial.branchId ?? branches[0]?.id ?? 0);
  const [treatmentId, setTreatmentId] = useState(initial.treatmentId ?? treatments[0]?.id ?? 0);
  const [date, setDate] = useState(initial.date ?? new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(initial.time ?? "");
  const [guests, setGuests] = useState(initial.guests ?? 1);
  const [serviceType, setServiceType] = useState<"in_spa" | "doorstep">(initial.serviceType ?? "in_spa");
  const [pref, setPref] = useState<"any" | "specific">(initial.therapistId ? "specific" : "any");
  const [therapistId, setTherapistId] = useState<number | "">(initial.therapistId ?? "");
  const [slots, setSlots] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [availError, setAvailError] = useState<string | null>(null);

  const [customer, setCustomer] = useState({ name: "", email: "", phone: "", whatsapp: "", country: "", specialRequest: "" });
  const [address, setAddress] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [promo, setPromo] = useState<any>(null);
  const [promoError, setPromoError] = useState<string | null>(null);

  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState<any>(null);
  const [payment, setPayment] = useState<any>(null);

  const treatment = useMemo(() => treatments.find((t) => t.id === treatmentId), [treatments, treatmentId]);

  // Prefill identity from session
  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const u = d?.data?.user;
        if (u) setCustomer((c) => ({ ...c, name: c.name || u.full_name || "", email: c.email || u.email || "", phone: c.phone || u.phone || "" }));
      })
      .catch(() => undefined);
  }, []);

  // Live availability
  useEffect(() => {
    if (!treatmentId || !branchId || !date) return;
    let alive = true;
    setLoadingSlots(true);
    setAvailError(null);
    const qs = new URLSearchParams({
      spaId: String(spa.id), branchId: String(branchId), treatmentId: String(treatmentId),
      date, guests: String(guests), serviceType,
    });
    if (pref === "specific" && therapistId) qs.set("therapistId", String(therapistId));
    fetch(`/api/availability?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (!d.ok) { setAvailError(d.error || "Unavailable"); return; }
        const times = d.data.slots.map((s: any) => s.time);
        setSlots(times);
        setStatuses(d.data.therapistStatuses);
        if (time && !times.includes(time)) setTime("");
      })
      .catch(() => alive && setAvailError("Could not load availability"))
      .finally(() => alive && setLoadingSlots(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spa.id, branchId, treatmentId, date, guests, serviceType, pref, therapistId]);

  const q = treatment ? quote(treatment, guests, serviceType, promo) : null;

  const canNext = (): boolean => {
    switch (step) {
      case 1: return !!branchId;
      case 2: return !!treatmentId;
      case 3: return !!date;
      case 4: return !!time;
      case 5: return guests >= 1;
      case 6: return pref === "any" || !!therapistId;
      case 7: return serviceType !== "doorstep" || address.trim().length > 3;
      case 8: return !!customer.name && /.+@.+\..+/.test(customer.email);
      case 9: return true;
      default: return true;
    }
  };

  const submitBooking = async (): Promise<{ ref?: string; error?: string }> => {
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        spaId: spa.id, branchId, treatmentId,
        therapistPreference: pref,
        therapistId: pref === "specific" && therapistId ? therapistId : undefined,
        date, time, guests, serviceType,
        customer,
        address: serviceType === "doorstep" ? address : undefined,
        promoCode: promoCode || undefined,
      }),
    });
    const d = await res.json();
    if (!d.ok) return { error: d.error || "Booking failed" };
    setBooking(d.data.booking);
    return { ref: d.data.booking.ref };
  };

  /** Creates the booking if needed, then captures payment with the returned ref. */
  const pay = async (method: string) => {
    setError(null);
    let ref = booking?.ref as string | undefined;
    if (!ref) {
      const created = await submitBooking();
      if (created.error) { setError(created.error); return; }
      ref = created.ref;
    }
    if (!ref) { setError("Could not create your booking. Please try again."); return; }
    await finishPay(ref, method);
  };

  const finishPay = async (ref: string, method: string) => {
    setPaying(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${ref}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method }),
      });
      const d = await res.json();
      if (!d.ok) { setError(d.error || "Payment failed"); return; }
      setBooking(d.data.booking);
      setPayment(d.data.payment);
      setStep(11);
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setPaying(false);
    }
  };

  const startBooking = async () => {
    setError(null);
    const created = await submitBooking();
    if (created.error) { setError(created.error); return; }
    setStep(10);
  };

  return (
    <div className="mt-4">
      {/* Stepper */}
      <ol className="flex flex-wrap gap-1.5 text-xs" aria-label="Booking progress">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const active = n === step;
          const done = n < step;
          return (
            <li
              key={label}
              className={`rounded-full px-2.5 py-1 font-semibold ${
                active ? "bg-jade text-white" : done ? "bg-jade-pale text-jade" : "bg-cream-deep text-ink-soft"
              }`}
            >
              {n}. {label}
            </li>
          );
        })}
      </ol>

      <div className="card mt-4 p-5">
        {/* STEP 1 — spa (already selected via URL) */}
        {step === 1 && (
          <div>
            <h2 className="font-display text-xl font-bold">1. Select spa &amp; branch</h2>
            <div className="mt-3 rounded-lg bg-jade-pale p-4">
              <div className="font-semibold text-jade">{spa.name}</div>
              <div className="text-sm text-ink-soft">{spa.address || spa.city}</div>
            </div>
            {branches.length > 1 && (
              <div className="mt-3">
                <label className="label" htmlFor="bk-branch">Branch</label>
                <select id="bk-branch" className="input" value={branchId} onChange={(e) => setBranchId(Number(e.target.value))}>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}
          </div>
        )}

        {/* STEP 2 — treatment */}
        {step === 2 && (
          <div>
            <h2 className="font-display text-xl font-bold">2. Select treatment</h2>
            <div className="mt-3 space-y-2">
              {treatments.map((t) => (
                <label key={t.id} className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 ${treatmentId === t.id ? "border-jade bg-jade-pale" : "border-[#e8e2d3]"}`}>
                  <span className="flex items-center gap-3">
                    <input type="radio" name="treatment" checked={treatmentId === t.id} onChange={() => setTreatmentId(t.id)} />
                    <span>
                      <span className="block font-semibold">{t.name}</span>
                      <span className="block text-xs text-ink-soft">{t.duration_min} min · {t.min_guests}–{t.max_guests} guests</span>
                    </span>
                  </span>
                  <span className="font-bold text-jade">{fmtMoney(t.currency, Math.round(t.price * (1 - t.discount / 100)))}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* STEP 3 — date */}
        {step === 3 && (
          <div>
            <h2 className="font-display text-xl font-bold">3. Select date</h2>
            <input
              type="date"
              className="input mt-3 max-w-xs"
              value={date}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Booking date"
            />
          </div>
        )}

        {/* STEP 4 — time (live availability) */}
        {step === 4 && (
          <div>
            <h2 className="font-display text-xl font-bold">4. Select time</h2>
            <p className="mt-1 text-sm text-ink-soft">Live availability for {date} · {treatment?.duration_min} min</p>
            {loadingSlots && <p className="mt-3 text-sm text-ink-soft">Checking real-time availability…</p>}
            {availError && <p className="mt-3 text-sm text-danger">{availError}</p>}
            {!loadingSlots && !availError && slots.length === 0 && (
              <p className="mt-3 text-sm text-ink-soft">No slots free on this date. Please pick another day.</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {slots.map((t) => (
                <button key={t} type="button" className="slot-btn" aria-pressed={time === t} onClick={() => { setTime(t); setStep(5); }}>
                  {t}
                </button>
              ))}
            </div>
            {statuses.length > 0 && (
              <div className="mt-5 border-t border-[#f0ebdd] pt-3">
                <span className="label">Therapist availability</span>
                <table className="table-spa max-w-sm">
                  <tbody>
                    {statuses.map((s) => (
                      <tr key={s.therapistId}>
                        <td>{s.name}</td>
                        <td className="text-right">
                          <span className={`badge ${s.status === "Available" ? "bg-jade-pale text-jade" : s.status === "Treatment" ? "bg-cream-deep text-ink-soft" : s.status === "Break" ? "bg-[#fdf1d7] text-gold-deep" : "bg-[#f7e5e3] text-danger"}`}>
                            {s.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* STEP 5 — guests */}
        {step === 5 && (
          <div>
            <h2 className="font-display text-xl font-bold">5. Number of guests</h2>
            <div className="mt-3 flex items-center gap-3">
              <button className="btn btn-outline !px-4" type="button" onClick={() => setGuests((g) => Math.max(1, g - 1))} aria-label="Fewer guests">−</button>
              <span className="font-display text-3xl font-bold">{guests}</span>
              <button className="btn btn-outline !px-4" type="button" onClick={() => setGuests((g) => Math.min(treatment?.max_guests ?? 4, g + 1))} aria-label="More guests">+</button>
              <span className="text-sm text-ink-soft">max {treatment?.max_guests ?? 4}</span>
            </div>
          </div>
        )}

        {/* STEP 6 — therapist preference */}
        {step === 6 && (
          <div>
            <h2 className="font-display text-xl font-bold">6. Therapist preference</h2>
            <div className="mt-3 space-y-2">
              <label className={`flex items-center gap-3 rounded-lg border p-3 ${pref === "any" ? "border-jade bg-jade-pale" : "border-[#e8e2d3]"}`}>
                <input type="radio" name="pref" checked={pref === "any"} onChange={() => setPref("any")} />
                <span className="font-semibold">Any therapist</span>
              </label>
              <label className={`flex items-center gap-3 rounded-lg border p-3 ${pref === "specific" ? "border-jade bg-jade-pale" : "border-[#e8e2d3]"}`}>
                <input type="radio" name="pref" checked={pref === "specific"} onChange={() => setPref("specific")} />
                <span className="font-semibold">Select therapist</span>
              </label>
            </div>
            {pref === "specific" && (
              <select className="input mt-3 max-w-xs" value={therapistId} onChange={(e) => setTherapistId(e.target.value ? Number(e.target.value) : "")} aria-label="Therapist">
                <option value="">Choose a therapist…</option>
                {therapists.map((t) => <option key={t.id} value={t.id}>{t.name} — {t.specialty || "Therapist"}</option>)}
              </select>
            )}
          </div>
        )}

        {/* STEP 7 — service type */}
        {step === 7 && (
          <div>
            <h2 className="font-display text-xl font-bold">7. Service type</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setServiceType("in_spa")}
                className={`rounded-lg border p-4 text-left ${serviceType === "in_spa" ? "border-jade bg-jade-pale" : "border-[#e8e2d3]"}`}
              >
                <div className="font-semibold">🏖 At spa</div>
                <div className="text-sm text-ink-soft">Enjoy the treatment at {spa.name}.</div>
              </button>
              <button
                type="button"
                onClick={() => treatment?.home_service && setServiceType("doorstep")}
                disabled={!treatment?.home_service}
                className={`rounded-lg border p-4 text-left disabled:opacity-50 ${serviceType === "doorstep" ? "border-jade bg-jade-pale" : "border-[#e8e2d3]"}`}
                title={treatment?.home_service ? "" : "Not offered for this treatment"}
              >
                <div className="font-semibold">🚗 Doorstep / mobile</div>
                <div className="text-sm text-ink-soft">
                  {treatment?.home_service ? `Travel fee ${treatment.currency} ${(treatment.travel_fee || 0).toLocaleString()}` : "Not offered for this treatment"}
                </div>
              </button>
            </div>
            {serviceType === "doorstep" && (
              <div className="mt-3">
                <label className="label" htmlFor="bk-address">Your address / hotel / villa *</label>
                <input id="bk-address" className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, hotel name, area" />
              </div>
            )}
          </div>
        )}

        {/* STEP 8 — customer details */}
        {step === 8 && (
          <div>
            <h2 className="font-display text-xl font-bold">8. Your details</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="c-name">Full name *</label>
                <input id="c-name" className="input" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="c-email">Email *</label>
                <input id="c-email" type="email" className="input" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="c-phone">Phone</label>
                <input id="c-phone" className="input" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="c-wa">WhatsApp</label>
                <input id="c-wa" className="input" value={customer.whatsapp} onChange={(e) => setCustomer({ ...customer, whatsapp: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="c-country">Country</label>
                <input id="c-country" className="input" value={customer.country} onChange={(e) => setCustomer({ ...customer, country: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="c-req">Special request</label>
                <textarea id="c-req" className="input" rows={2} value={customer.specialRequest} onChange={(e) => setCustomer({ ...customer, specialRequest: e.target.value })} />
              </div>
            </div>
          </div>
        )}

        {/* STEP 9 — price summary */}
        {step === 9 && q && (
          <div>
            <h2 className="font-display text-xl font-bold">9. Price summary</h2>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-ink-soft">Treatment</dt><dd className="font-semibold">{treatment.name}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-soft">Duration</dt><dd>{treatment.duration_min} min</dd></div>
              <div className="flex justify-between"><dt className="text-ink-soft">Guests</dt><dd>{guests}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-soft">Spa</dt><dd>{spa.name}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-soft">Date &amp; time</dt><dd>{date} · {time}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-soft">Therapist</dt><dd>{pref === "specific" ? therapists.find((t) => t.id === therapistId)?.name || "Selected" : "Any available"}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-soft">Service</dt><dd>{serviceType === "in_spa" ? "At spa" : "Doorstep"}</dd></div>
              <hr className="border-[#e8e2d3]" />
              <div className="flex justify-between"><dt className="text-ink-soft">Subtotal</dt><dd>{fmtMoney(q.currency, q.subtotal)}</dd></div>
              {q.promoDiscount > 0 && (
                <div className="flex justify-between text-jade"><dt>Discount ({promo.code})</dt><dd>− {fmtMoney(q.currency, q.promoDiscount)}</dd></div>
              )}
              {q.travelFee > 0 && <div className="flex justify-between"><dt className="text-ink-soft">Travel fee</dt><dd>{fmtMoney(q.currency, q.travelFee)}</dd></div>}
              <hr className="border-[#e8e2d3]" />
              <div className="flex justify-between text-lg font-bold"><dt>Total</dt><dd className="text-jade">{fmtMoney(q.currency, q.total)}</dd></div>
            </dl>
            <div className="mt-4 flex gap-2">
              <input className="input max-w-[200px]" placeholder="Promo code" value={promoCode} onChange={(e) => setPromoCode(e.target.value)} aria-label="Promo code" />
              <button
                type="button"
                className="btn btn-outline"
                onClick={async () => {
                  if (!promoCode) return;
                  const res = await fetch("/api/promo/validate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ code: promoCode, spaId: spa.id, treatmentId, subtotal: q.subtotal }),
                  });
                  const d = await res.json();
                  if (d.ok) { setPromo(d.data.promo); setPromoError(null); }
                  else { setPromo(null); setPromoError(d.error); }
                }}
              >
                Apply
              </button>
            </div>
            {promoError && <p className="mt-1 text-sm text-danger">{promoError}</p>}
            {promo && <p className="mt-1 text-sm text-jade">✓ {promo.code} applied (− {fmtMoney(q.currency, q.promoDiscount)})</p>}
            <p className="mt-3 text-xs text-ink-soft">
              {treatment.description?.slice(0, 160)}… — free cancellation up to {spa.cancel_hours} hours before.
            </p>
          </div>
        )}

        {/* STEP 10 — payment */}
        {step === 10 && (
          <div>
            <h2 className="font-display text-xl font-bold">10. Payment</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Your slot is held for 10 minutes while you pay. Total:{" "}
              <strong>{q && fmtMoney(q.currency, q.total)}</strong>
            </p>
            {error && <p className="mt-3 rounded-lg bg-[#f7e5e3] p-3 text-sm text-danger">{error}</p>}
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {[
                ["qris", "QRIS", "Scan with any Indonesian e-wallet"],
                ["card", "Credit / debit card", "Secure hosted checkout"],
                ["bank_transfer", "Bank transfer", "BCA · Mandiri · BNI"],
                ["wallet", "E-wallet", "GoPay · OVO · Dana"],
              ].map(([m, label, hint]) => (
                <button
                  key={m}
                  type="button"
                  disabled={paying}
                  onClick={() => pay(m)}
                  className="rounded-lg border border-[#e8e2d3] p-4 text-left transition hover:border-jade hover:bg-jade-pale disabled:opacity-50"
                >
                  <div className="font-semibold">{label}</div>
                  <div className="text-xs text-ink-soft">{hint}</div>
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-soft">
              🔒 Card details are handled by the payment provider and never stored by Book Your Spa.
            </p>
          </div>
        )}

        {/* STEP 11 — confirmation */}
        {step === 11 && booking && (
          <div className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-jade-pale text-2xl text-jade">✓</div>
            <h2 className="font-display mt-3 text-2xl font-bold">Booking confirmed!</h2>
            <p className="mt-1 text-ink-soft">A confirmation has been sent to {booking.customer_email}.</p>

            <div className="mx-auto mt-5 max-w-sm rounded-xl border-2 border-dashed border-jade p-5 text-left">
              <div className="eyebrow">Voucher</div>
              <div className="font-display text-xl font-bold">{booking.ref}</div>
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between"><dt>Spa</dt><dd className="font-semibold">{spa.name}</dd></div>
                <div className="flex justify-between"><dt>Treatment</dt><dd>{treatment?.name}</dd></div>
                <div className="flex justify-between"><dt>When</dt><dd>{booking.booking_date} · {booking.start_time}</dd></div>
                <div className="flex justify-between"><dt>Guests</dt><dd>{booking.guests}</dd></div>
                <div className="flex justify-between"><dt>Total</dt><dd className="font-bold text-jade">{fmtMoney(booking.currency, booking.total)}</dd></div>
              </dl>
              <div className="mt-3 flex items-center justify-between border-t border-dashed border-jade/40 pt-3">
                <span className="badge bg-jade text-white">Status: {booking.status}</span>
                <QRBlock text={booking.ref} />
              </div>
            </div>

            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <button className="btn btn-primary" onClick={() => router.push(`/dashboard/bookings/${booking.ref}`)}>
                View my booking
              </button>
              <button className="btn btn-outline" onClick={() => router.push("/explore")}>Book another treatment</button>
            </div>
          </div>
        )}

        {/* Navigation */}
        {step < 11 && (
          <div className="mt-6 flex items-center justify-between border-t border-[#f0ebdd] pt-4">
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              disabled={step === 1}
            >
              ← Back
            </button>
            {error && step !== 10 && <p className="text-sm text-danger">{error}</p>}
            <div className="flex items-center gap-3">
              {q && step >= 5 && <span className="hidden text-sm font-bold text-jade sm:block">{fmtMoney(q.currency, q.total)}</span>}
              {step < 9 && (
                <button type="button" className="btn btn-primary" disabled={!canNext()} onClick={() => setStep((s) => s + 1)}>
                  Continue →
                </button>
              )}
              {step === 9 && (
                <button type="button" className="btn btn-gold" onClick={startBooking} disabled={paying}>
                  {paying ? "Processing…" : "Proceed to payment →"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Small client-side QR renderer (via public QR API fallback = text badge). */
function QRBlock({ text }: { text: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    import("qrcode")
      .then((QR) => QR.toDataURL(text, { width: 96, margin: 1 }))
      .then((d) => alive && setSrc(d))
      .catch(() => alive && setSrc(null));
    return () => { alive = false; };
  }, [text]);
  return (
    <div className="text-right">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={`QR code for booking ${text}`} className="ml-auto h-20 w-20 rounded" />
      ) : (
        <div className="ml-auto h-20 w-20 animate-pulse rounded bg-cream-deep" aria-hidden />
      )}
      <div className="mt-1 text-[10px] text-ink-soft">Scan at reception</div>
    </div>
  );
}
