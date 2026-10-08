"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Supplier catalog manager: treatments CRUD + therapists CRUD with
 * weekly schedules, days off and qualifications.
 */
export function SupplierCatalog({ spaId, initialTab }: { spaId: number; initialTab: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<"catalog" | "therapists">(initialTab as any);
  const [data, setData] = useState<{ treatments: any[]; therapists: any[]; branches: any[] }>({ treatments: [], therapists: [], branches: [] });
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    const [t, th] = await Promise.all([
      fetch("/api/supplier/treatments", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/supplier/therapists", { cache: "no-store" }).then((r) => r.json()),
    ]);
    setData({
      treatments: t?.data?.treatments ?? [],
      therapists: th?.data?.therapists ?? [],
      branches: t?.data?.branches ?? [],
    });
  };
  useEffect(() => { load(); }, []);

  const post = async (url: string, payload: any): Promise<void> => {
    setErr(null); setMsg(null);
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const d = await res.json();
    if (!d.ok) { setErr(d.error || "Save failed"); return; }
    setMsg("Saved.");
    load();
    router.refresh();
  };

  return (
    <div className="mt-6">
      <div className="flex gap-2">
        <button className={`chip ${tab === "catalog" ? "chip-active" : ""}`} onClick={() => setTab("catalog")}>Treatments ({data.treatments.length})</button>
        <button className={`chip ${tab === "therapists" ? "chip-active" : ""}`} onClick={() => setTab("therapists")}>Therapists ({data.therapists.length})</button>
      </div>
      {msg && <p className="mt-3 rounded bg-jade-pale p-2 text-sm text-jade">{msg}</p>}
      {err && <p className="mt-3 rounded bg-[#f7e5e3] p-2 text-sm text-danger">{err}</p>}

      {tab === "catalog" ? (
        <TreatmentForm branches={data.branches} onSave={(p: any) => post("/api/supplier/treatments", p)} rows={data.treatments} />
      ) : (
        <TherapistForm
          treatments={data.treatments}
          branches={data.branches}
          onSave={(p: any) => post("/api/supplier/therapists", p)}
          rows={data.therapists}
        />
      )}
    </div>
  );
}

function TreatmentForm({ branches, onSave, rows }: any) {
  const empty = { name: "", durationMin: 60, price: 300000, discount: 0, currency: "IDR", minGuests: 1, maxGuests: 2, homeService: false, travelFee: 0, bufferMin: 0, description: "", roomRequired: true, status: "active" as const };
  const [f, setF] = useState<any>(empty);
  const [branchIds, setBranchIds] = useState<number[]>(branches.map((b: any) => b.id));

  useEffect(() => { setBranchIds(branches.map((b: any) => b.id)); }, [branches]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ ...f, branchIds, treatmentIds: undefined });
    setF(empty);
  };

  return (
    <div className="mt-4 grid gap-6 lg:grid-cols-2">
      <form onSubmit={submit} className="card space-y-3 p-5">
        <h3 className="font-display text-lg font-bold">{f.id ? "Edit" : "New"} treatment</h3>
        <input className="input" placeholder="Treatment name *" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        <textarea className="input" rows={2} placeholder="Description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <div className="grid grid-cols-3 gap-2">
          <input className="input" type="number" min={15} step={15} placeholder="Duration (min)" value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: Number(e.target.value) })} aria-label="Duration" />
          <input className="input" type="number" min={0} placeholder="Price" value={f.price} onChange={(e) => setF({ ...f, price: Number(e.target.value) })} aria-label="Price" />
          <input className="input" type="number" min={0} max={90} placeholder="Discount %" value={f.discount} onChange={(e) => setF({ ...f, discount: Number(e.target.value) })} aria-label="Discount" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <input className="input" type="number" min={1} value={f.minGuests} onChange={(e) => setF({ ...f, minGuests: Number(e.target.value) })} aria-label="Min guests" />
          <input className="input" type="number" min={1} value={f.maxGuests} onChange={(e) => setF({ ...f, maxGuests: Number(e.target.value) })} aria-label="Max guests" />
          <input className="input" type="number" min={0} step={5} value={f.bufferMin} onChange={(e) => setF({ ...f, bufferMin: Number(e.target.value) })} aria-label="Buffer min" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.homeService} onChange={(e) => setF({ ...f, homeService: e.target.checked })} />
          Doorstep / mobile available
        </label>
        {f.homeService && (
          <input className="input" type="number" min={0} placeholder="Travel fee" value={f.travelFee} onChange={(e) => setF({ ...f, travelFee: Number(e.target.value) })} aria-label="Travel fee" />
        )}
        <div className="flex flex-wrap gap-2">
          {branches.map((b: any) => (
            <label key={b.id} className="chip cursor-pointer">
              <input
                type="checkbox"
                checked={branchIds.includes(b.id)}
                onChange={(e) => setBranchIds(e.target.checked ? [...branchIds, b.id] : branchIds.filter((x) => x !== b.id))}
              />
              {b.name}
            </label>
          ))}
        </div>
        <button className="btn btn-primary w-full">Save treatment</button>
      </form>

      <div className="space-y-2">
        {rows.map((t: any) => (
          <div key={t.id} className="card flex items-center justify-between p-4">
            <div>
              <div className="font-semibold">{t.name}</div>
              <div className="text-xs text-ink-soft">{t.duration_min} min · {t.currency} {t.price.toLocaleString()} · {t.therapist_count} qualified</div>
            </div>
            <div className="flex gap-1">
              <button
                className="chip !py-0.5 !text-[0.65rem]"
                onClick={() => setF({
                  id: t.id, name: t.name, durationMin: t.duration_min, price: t.price, discount: t.discount,
                  currency: t.currency, minGuests: t.min_guests, maxGuests: t.max_guests,
                  homeService: !!t.home_service, travelFee: t.travel_fee, bufferMin: t.buffer_min,
                  description: t.description || "", roomRequired: !!t.room_required, status: t.status,
                })}
              >
                Edit
              </button>
              <button
                className="chip !py-0.5 !text-[0.65rem]"
                onClick={async () => {
                  await fetch(`/api/supplier/treatments?id=${t.id}`, { method: "DELETE" });
                  location.reload();
                }}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-ink-soft">No treatments yet — add your first one.</p>}
      </div>
    </div>
  );
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function TherapistForm({ treatments, branches, onSave, rows }: any) {
  const empty = { name: "", gender: "female", specialty: "", status: "active", treatmentIds: [] as number[], schedule: [] as any[], daysOff: [] as any[] };
  const [f, setF] = useState<any>(empty);

  const toggleDay = (wd: number) => {
    const has = f.schedule.find((s: any) => s.weekday === wd);
    setF({
      ...f,
      schedule: has
        ? f.schedule.filter((s: any) => s.weekday !== wd)
        : [...f.schedule, { weekday: wd, startTime: "09:00", endTime: "18:00" }],
    });
  };

  const setDayTime = (wd: number, key: "startTime" | "endTime", v: string) => {
    setF({
      ...f,
      schedule: f.schedule.map((s: any) => (s.weekday === wd ? { ...s, [key]: v } : s)),
    });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(f);
    setF(empty);
  };

  return (
    <div className="mt-4 grid gap-6 lg:grid-cols-2">
      <form onSubmit={submit} className="card space-y-3 p-5">
        <h3 className="font-display text-lg font-bold">{f.id ? "Edit" : "New"} therapist</h3>
        <input className="input" placeholder="Name *" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        <div className="grid grid-cols-2 gap-2">
          <select className="input" value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })} aria-label="Gender">
            <option value="female">Female</option><option value="male">Male</option><option value="other">Other</option>
          </select>
          <input className="input" placeholder="Specialty" value={f.specialty} onChange={(e) => setF({ ...f, specialty: e.target.value })} />
        </div>

        <div>
          <span className="label">Weekly schedule (click to toggle)</span>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((d, wd) => (
              <button key={d} type="button" className={`chip ${f.schedule.find((s: any) => s.weekday === wd) ? "chip-active" : ""}`} onClick={() => toggleDay(wd)}>
                {d}
              </button>
            ))}
          </div>
          <div className="mt-2 space-y-1">
            {f.schedule.map((s: any) => (
              <div key={s.weekday} className="flex items-center gap-2 text-xs">
                <span className="w-10 font-semibold">{DAYS[s.weekday]}</span>
                <input type="time" className="input !w-auto !py-1" value={s.startTime} onChange={(e) => setDayTime(s.weekday, "startTime", e.target.value)} aria-label={`Start ${DAYS[s.weekday]}`} />
                <span>–</span>
                <input type="time" className="input !w-auto !py-1" value={s.endTime} onChange={(e) => setDayTime(s.weekday, "endTime", e.target.value)} aria-label={`End ${DAYS[s.weekday]}`} />
              </div>
            ))}
          </div>
        </div>

        <div>
          <span className="label">Qualified treatments</span>
          <div className="max-h-40 space-y-1 overflow-y-auto rounded border border-[#e8e2d3] p-2">
            {treatments.map((t: any) => (
              <label key={t.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={f.treatmentIds.includes(t.id)}
                  onChange={(e) => setF({
                    ...f,
                    treatmentIds: e.target.checked ? [...f.treatmentIds, t.id] : f.treatmentIds.filter((x: number) => x !== t.id),
                  })}
                />
                {t.name}
              </label>
            ))}
            {treatments.length === 0 && <p className="text-xs text-ink-soft">Create treatments first.</p>}
          </div>
        </div>

        <div>
          <span className="label">Days off</span>
          <div className="flex gap-2">
            <input type="date" className="input" id="dayoff" aria-label="Day off date" />
            <button
              type="button"
              className="chip"
              onClick={() => {
                const v = (document.getElementById("dayoff") as HTMLInputElement).value;
                if (v) setF({ ...f, daysOff: [...f.daysOff, { date: v, reason: "Day off" }] });
              }}
            >
              Add
            </button>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {f.daysOff.map((d: any) => (
              <span key={d.date} className="chip !py-0.5 !text-[0.65rem]">
                {d.date}
                <button type="button" onClick={() => setF({ ...f, daysOff: f.daysOff.filter((x: any) => x.date !== d.date) })}>×</button>
              </span>
            ))}
          </div>
        </div>

        <button className="btn btn-primary w-full">Save therapist</button>
      </form>

      <div className="space-y-2">
        {rows.map((t: any) => (
          <div key={t.id} className="card p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold">{t.name}</div>
                <div className="text-xs text-ink-soft">{t.specialty || "Therapist"} · {t.status}</div>
                <div className="text-xs text-ink-soft">
                  {t.schedule.length} day(s)/week · {t.treatmentIds.length} treatment(s)
                </div>
              </div>
              <button
                className="chip !py-0.5 !text-[0.65rem]"
                onClick={() => setF({
                  id: t.id, name: t.name, gender: t.gender || "female", specialty: t.specialty || "",
                  status: t.status, treatmentIds: t.treatmentIds,
                  schedule: t.schedule.map((s: any) => ({ weekday: s.weekday, startTime: s.start_time, endTime: s.end_time })),
                  daysOff: t.daysOff.map((d: any) => ({ date: d.off_date, reason: d.reason })),
                })}
              >
                Edit
              </button>
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-ink-soft">No therapists yet.</p>}
      </div>
    </div>
  );
}
