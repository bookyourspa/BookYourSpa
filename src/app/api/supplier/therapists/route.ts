import { z } from "zod";
import { handler, parseBody, ApiError } from "@/lib/api";
import { getDb } from "@/lib/db";
import { requireSupplierSpa } from "@/lib/supplier";

/** GET /api/supplier/therapists — with schedules and qualifications. */
export const GET = handler({ auth: "supplier:manage" }, async (_req, { user }) => {
  const db = getDb();
  const spa = requireSupplierSpa(user!);
  const therapists = db.prepare("SELECT * FROM therapists WHERE spa_id = ? ORDER BY name").all(spa.id);
  const withDetails = (therapists as any[]).map((t) => ({
    ...t,
    schedule: db.prepare("SELECT weekday, start_time, end_time FROM therapist_schedules WHERE therapist_id = ?").all(t.id),
    daysOff: db.prepare("SELECT off_date, reason FROM therapist_days_off WHERE therapist_id = ? AND off_date >= date('now') ORDER BY off_date").all(t.id),
    treatmentIds: db.prepare("SELECT treatment_id FROM therapist_treatments WHERE therapist_id = ?").all(t.id).map((r: any) => r.treatment_id),
  }));
  const branches = db.prepare("SELECT id, name FROM branches WHERE spa_id = ?").all(spa.id);
  const treatments = db.prepare("SELECT id, name, duration_min FROM treatments WHERE spa_id = ? AND status = 'active'").all(spa.id);
  return { therapists: withDetails, branches, treatments };
});

const scheduleItem = z.object({
  weekday: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
});

const therapistSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().min(2).max(120),
  gender: z.enum(["female", "male", "other"]).optional(),
  branchId: z.number().int().positive().nullable().optional(),
  photoUrl: z.string().max(500).optional(),
  specialty: z.string().max(200).optional(),
  skills: z.array(z.string().max(80)).optional(),
  languages: z.array(z.string().max(40)).optional(),
  qualifications: z.array(z.string().max(120)).optional(),
  status: z.enum(["active", "inactive", "on_leave"]).default("active"),
  treatmentIds: z.array(z.number().int()).default([]),
  schedule: z.array(scheduleItem).default([]),
  daysOff: z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reason: z.string().max(120).optional() })).default([]),
});

/** POST /api/supplier/therapists — create/update therapist with schedule + qualifications. */
export const POST = handler({ auth: "supplier:manage" }, async (req, { user }) => {
  const d = await parseBody(req, therapistSchema);
  const db = getDb();
  const spa = requireSupplierSpa(user!);

  let therapistId = d.id;
  if (therapistId) {
    const own = db.prepare("SELECT id FROM therapists WHERE id = ? AND spa_id = ?").get(therapistId, spa.id);
    if (!own) throw new ApiError(404, "Therapist not found.");
    db.prepare(
      `UPDATE therapists SET name=?, gender=?, branch_id=?, photo_url=?, specialty=?, skills=?,
         languages=?, qualifications=?, status=? WHERE id=?`
    ).run(d.name, d.gender ?? null, d.branchId ?? null, d.photoUrl ?? null, d.specialty ?? null,
      JSON.stringify(d.skills ?? []), JSON.stringify(d.languages ?? []), JSON.stringify(d.qualifications ?? []),
      d.status, therapistId);
  } else {
    therapistId = Number(
      db
        .prepare(
          `INSERT INTO therapists (spa_id, branch_id, name, gender, photo_url, specialty, skills, languages, qualifications, status)
           VALUES (?,?,?,?,?,?,?,?,?,?)`
        )
        .run(spa.id, d.branchId ?? null, d.name, d.gender ?? null, d.photoUrl ?? null, d.specialty ?? null,
          JSON.stringify(d.skills ?? []), JSON.stringify(d.languages ?? []), JSON.stringify(d.qualifications ?? []), d.status)
        .lastInsertRowid
    );
  }

  db.prepare("DELETE FROM therapist_schedules WHERE therapist_id = ?").run(therapistId);
  const insSched = db.prepare(
    "INSERT INTO therapist_schedules (therapist_id, weekday, start_time, end_time) VALUES (?,?,?,?)"
  );
  for (const s of d.schedule) insSched.run(therapistId, s.weekday, s.startTime, s.endTime);

  db.prepare("DELETE FROM therapist_days_off WHERE therapist_id = ?").run(therapistId);
  const insOff = db.prepare("INSERT INTO therapist_days_off (therapist_id, off_date, reason) VALUES (?,?,?)");
  for (const o of d.daysOff) insOff.run(therapistId, o.date, o.reason ?? null);

  db.prepare("DELETE FROM therapist_treatments WHERE therapist_id = ?").run(therapistId);
  const insQual = db.prepare("INSERT OR IGNORE INTO therapist_treatments (therapist_id, treatment_id) VALUES (?,?)");
  for (const tid of d.treatmentIds) insQual.run(therapistId, tid);

  return { therapistId };
});

/** DELETE /api/supplier/therapists?id=N */
export const DELETE = handler({ auth: "supplier:manage" }, async (req, { user }) => {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) throw new ApiError(400, "id is required.");
  const db = getDb();
  const spa = requireSupplierSpa(user!);
  const own = db.prepare("SELECT id FROM therapists WHERE id = ? AND spa_id = ?").get(id, spa.id);
  if (!own) throw new ApiError(404, "Therapist not found.");
  db.prepare("UPDATE therapists SET status = 'inactive' WHERE id = ?").run(id);
  return { deactivated: true };
});
