import type { MetadataRoute } from "next";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.APP_URL || "http://localhost:3000";
  const db = getDb();
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = ["", "/explore", "/supplier-guide", "/list-your-spa"].map((p) => ({
    url: `${base}${p}`,
    lastModified: now,
    changeFrequency: "daily" as const,
    priority: p === "" ? 1 : 0.7,
  }));

  const locations = db
    .prepare("SELECT slug FROM locations WHERE kind IN ('country','region','city','area')")
    .all() as any[];
  const spas = db
    .prepare("SELECT slug FROM spas WHERE status='published'")
    .all() as any[];
  const treatments = db
    .prepare(
      `SELECT DISTINCT t.slug FROM treatments t JOIN spas s ON s.id = t.spa_id
        WHERE t.status='active' AND s.status='published'`
    )
    .all() as any[];

  return [
    ...staticRoutes,
    ...locations.map((l) => ({ url: `${base}/spa/${l.slug}`, lastModified: now, changeFrequency: "daily" as const, priority: 0.9 })),
    ...treatments.map((t) => ({ url: `${base}/treatment/${t.slug}`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.8 })),
    ...spas.map((s) => ({ url: `${base}/spa/${s.slug}`, lastModified: now, changeFrequency: "daily" as const, priority: 0.9 })),
  ];
}
