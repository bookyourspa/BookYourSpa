import { z } from "zod";
import { handler, parseBody, ApiError } from "@/lib/api";
import { getDb } from "@/lib/db";

/** Returns the supplier's first spa (managed profile). */
export const GET = handler({ auth: "supplier:manage" }, async (_req, { user }) => {
  const db = getDb();
  const spa = db.prepare("SELECT * FROM spas WHERE supplier_id = ? ORDER BY id LIMIT 1").get(user!.supplier_id!);
  return { spa: spa ?? null };
});

const spaSchema = z.object({
  name: z.string().min(2).max(160),
  description: z.string().max(5000).optional(),
  slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
  address: z.string().max(300).optional(),
  city: z.string().max(80).optional(),
  country: z.string().max(60).default("Indonesia"),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional().or(z.literal("")),
  whatsapp: z.string().max(30).optional(),
  website: z.string().max(200).optional(),
  openingHours: z.record(z.string(), z.array(z.string())).optional(),
  facilities: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  spaTypes: z.array(z.string()).optional(),
  logoUrl: z.string().max(500).optional(),
  coverUrl: z.string().max(500).optional(),
  gallery: z.array(z.string()).optional(),
  /** 'submit' sends the profile to admin review; 'draft' keeps it private. */
  action: z.enum(["draft", "submit"]).default("draft"),
});

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

/** POST /api/supplier/spa — create or update the supplier's spa profile. */
export const POST = handler({ auth: "supplier:manage" }, async (req, { user }) => {
  const data = await parseBody(req, spaSchema);
  const db = getDb();
  const existing = db.prepare("SELECT * FROM spas WHERE supplier_id = ? ORDER BY id LIMIT 1").get(user!.supplier_id!) as any;

  const status = data.action === "submit" ? "pending" : existing?.status === "published" ? "published" : "draft";
  const slug = data.slug || existing?.slug || slugify(`${data.name}-${data.city || "spa"}`);

  if (existing) {
    if (existing.status === "published" && data.action === "submit") {
      // published spas keep visibility; edits don't unpublish them
    }
    db.prepare(
      `UPDATE spas SET name=?, description=?, slug=?, address=?, city=?, country=?, lat=?, lng=?,
        phone=?, email=?, whatsapp=?, website=?, opening_hours=?, facilities=?, languages=?,
        spa_types=?, logo_url=?, cover_url=?, gallery=?, status=?, updated_at=datetime('now')
       WHERE id=?`
    ).run(
      data.name, data.description ?? existing.description, slug, data.address ?? existing.address,
      data.city ?? existing.city, data.country, data.lat ?? existing.lat, data.lng ?? existing.lng,
      data.phone ?? existing.phone, data.email || existing.email, data.whatsapp ?? existing.whatsapp,
      data.website ?? existing.website,
      data.openingHours ? JSON.stringify(data.openingHours) : existing.opening_hours,
      data.facilities ? JSON.stringify(data.facilities) : existing.facilities,
      data.languages ? JSON.stringify(data.languages) : existing.languages,
      data.spaTypes ? JSON.stringify(data.spaTypes) : existing.spa_types,
      data.logoUrl ?? existing.logo_url, data.coverUrl ?? existing.cover_url,
      data.gallery ? JSON.stringify(data.gallery) : existing.gallery,
      existing.status === "published" ? "published" : status,
      existing.id
    );
    return { spaId: existing.id, status: existing.status === "published" ? "published" : status };
  }

  const info = db
    .prepare(
      `INSERT INTO spas (supplier_id, slug, name, description, address, city, country, lat, lng,
         phone, email, whatsapp, website, opening_hours, facilities, languages, spa_types,
         logo_url, cover_url, gallery, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      user!.supplier_id, slug, data.name, data.description ?? null, data.address ?? null,
      data.city ?? null, data.country, data.lat ?? null, data.lng ?? null, data.phone ?? null,
      data.email || null, data.whatsapp ?? null, data.website ?? null,
      data.openingHours ? JSON.stringify(data.openingHours) : null,
      JSON.stringify(data.facilities ?? []), JSON.stringify(data.languages ?? []),
      JSON.stringify(data.spaTypes ?? []), data.logoUrl ?? null, data.coverUrl ?? null,
      JSON.stringify(data.gallery ?? []), status
    );
  const spaId = Number(info.lastInsertRowid);
  // Every spa gets a default branch so bookings work immediately.
  db.prepare("INSERT INTO branches (spa_id, name, address, city, opening_hours) VALUES (?,?,?,?,?)")
    .run(spaId, "Main Branch", data.address ?? null, data.city ?? null, data.openingHours ? JSON.stringify(data.openingHours) : null);
  return { spaId, status };
});
