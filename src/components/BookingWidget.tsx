"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

interface Props {
  spa: any;
  branches: any[];
  treatments: any[];
  therapists: any[];
  initialTreatmentId?: number;
}

/**
 * Live availability widget embedded on the spa profile page.
 * Queries /api/availability for genuinely free slots and hands the selection
 * off to the full booking flow.
 */
export function BookingWidget({ spa, branches, treatments, therapists, initialTreatmentId }: Props) {
  const router = useRouter();
  const [branchId, setBranchId] = useState(branches[0]?.id ?? 0);
  const [treatmentId, setTreatmentId] = useState(initialTreatmentId ?? treatments[0]?.id ?? 0);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [guests, setGuests] = useState(1);
  const [serviceType, setServiceType] = useState<"in_spa" | "doorstep">("in_spa");
  const [therapistId, setTherapistId] = useState<number | "">("");
  const [slots, setSlots] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const treatment = useMemo(() => treatments.find((t) => t.id === treatmentId), [treatments, treatmentId]);

  useEffect(() => {
    if (!treatmentId || !branchId || !date) return;
    let alive = true;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({
      spaId: String(spa.id),
      branchId: String(branchId),
      treatmentId: String(treatmentId),
      date,
      guests: String(guests),
      serviceType,
    });
    if (therapistId) qs.set("therapistId", String(therapistId));
    fetch(`/api/availability?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (!d.ok) {
          setError(d.error || "Availability unavailable");
          setSlots([]);
          return;
        }
        setSlots(d.data.slots.map((s: any) => s.time));
        setStatuses(d.data.therapistStatuses);
      })
      .catch(() => alive && setError("Could not load availability"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [spa.id, branchId, treatmentId, date, guests, serviceType, therapistId]);

  const go = (time: string) => {
    const qs = new URLSearchParams({
      treatment: String(treatmentId),
      branch: String(branchId),
      date,
      time,
      guests: String(guests),
      service: serviceType,
    });
    if (therapistId) qs.set("therapist", String(therapistId));
    router.push(`/book/${spa.slug}?${qs.toString()}`);
  };

  if (!treatments.length) {
    return <p className="mt-3 text-sm text-ink-soft">This spa has not published treatments yet.</p>;
  }

  return (
    <div className="mt-3 space-y-3">
      {branches.length > 1 && (
        <div>
          <label className="label" htmlFor="bw-branch">Branch</label>
          <select id="bw-branch" className="input" value={branchId} onChange={(e) => setBranchId(Number(e.target.value))}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      )}

      <div>
        <label className="label" htmlFor="bw-treatment">Treatment</label>
        <select id="bw-treatment" className="input" value={treatmentId} onChange={(e) => setTreatmentId(Number(e.target.value))}>
          {treatments.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} · {t.duration_min}min · {t.currency} {Math.round(t.price * (1 - t.discount / 100)).toLocaleString()}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label" htmlFor="bw-date">Date</label>
          <input
            id="bw-date"
            type="date"
            className="input"
            value={date}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="bw-guests">Guests</label>
          <select id="bw-guests" className="input" value={guests} onChange={(e) => setGuests(Number(e.target.value))}>
            {Array.from({ length: Math.max(1, treatment?.max_guests ?? 4) }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n} {n === 1 ? "guest" : "guests"}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <span className="label">Service type</span>
        <div className="flex gap-2">
          <button className={`chip ${serviceType === "in_spa" ? "chip-active" : ""}`} onClick={() => setServiceType("in_spa")} type="button">
            At spa
          </button>
          <button
            className={`chip ${serviceType === "doorstep" ? "chip-active" : ""}`}
            onClick={() => setServiceType("doorstep")}
            type="button"
            disabled={!treatment?.home_service}
            title={treatment?.home_service ? "" : "Not offered for this treatment"}
          >
            Doorstep
          </button>
        </div>
      </div>

      <div>
        <span className="label">Therapist preference</span>
        <select className="input" value={therapistId} onChange={(e) => setTherapistId(e.target.value ? Number(e.target.value) : "")}>
          <option value="">Any therapist</option>
          {therapists.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      <div>
        <span className="label">Available times · {date}</span>
        {error && <p className="text-sm text-danger">{error}</p>}
        {loading && <p className="text-sm text-ink-soft">Checking availability…</p>}
        {!loading && !error && slots.length === 0 && (
          <p className="text-sm text-ink-soft">No free slots on this date — try another day.</p>
        )}
        <div className="mt-1 flex flex-wrap gap-2">
          {slots.map((t) => (
            <button key={t} type="button" className="slot-btn" onClick={() => go(t)}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {statuses.length > 0 && (
        <div className="border-t border-[#f0ebdd] pt-3">
          <span className="label">Therapist availability</span>
          <table className="table-spa">
            <tbody>
              {statuses.map((s) => (
                <tr key={s.therapistId}>
                  <td>{s.name}</td>
                  <td className="text-right">
                    <span
                      className={`badge ${
                        s.status === "Available" ? "bg-jade-pale text-jade"
                        : s.status === "Treatment" ? "bg-cream-deep text-ink-soft"
                        : s.status === "Break" ? "bg-[#fdf1d7] text-gold-deep"
                        : "bg-[#f7e5e3] text-danger"
                      }`}
                    >
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
  );
}
