import Link from "next/link";
import { getDb } from "@/lib/db";
import { SpaCard } from "@/components/SpaCard";
import { ExploreClient } from "@/components/ExploreClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Explore spas & treatments",
  description:
    "Search spas by location, category, price, rating, duration and service type. Real-time availability across Bali and international destinations.",
  alternates: { canonical: "/explore" },
};

const SORTS: [string, string][] = [
  ["recommended", "Recommended"],
  ["rating", "Rating"],
  ["price_asc", "Price: low to high"],
  ["price_desc", "Price: high to low"],
  ["popular", "Popular"],
  ["newest", "Newest"],
];

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const db = getDb();

  const where: string[] = ["s.status = 'published'", "sup.status = 'approved'"];
  const params: any[] = [];
  const q = sp.q;
  const location = sp.location;
  if (q) {
    where.push(`(s.name LIKE ? OR s.city LIKE ? OR s.address LIKE ? OR s.description LIKE ?
      OR EXISTS (SELECT 1 FROM treatments t WHERE t.spa_id = s.id AND t.status='active' AND t.name LIKE ?))`);
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }
  if (location) {
    where.push(`(s.city LIKE ? OR s.address LIKE ? OR EXISTS (SELECT 1 FROM locations l WHERE l.id = s.location_id AND l.slug = ?))`);
    params.push(`%${location}%`, `%${location}%`, location);
  }
  if (sp.category) {
    where.push(`EXISTS (SELECT 1 FROM treatments t WHERE t.spa_id = s.id AND t.status='active' AND t.category_id = (SELECT id FROM treatment_categories WHERE slug = ?))`);
    params.push(sp.category);
  }
  if (sp.spaType) {
    where.push("s.spa_types LIKE ?");
    params.push(`%${sp.spaType}%`);
  }
  if (sp.serviceType === "doorstep") {
    where.push("EXISTS (SELECT 1 FROM treatments t WHERE t.spa_id = s.id AND t.status='active' AND t.home_service = 1)");
  }
  if (sp.minRating) {
    where.push("s.rating_avg >= ?");
    params.push(Number(sp.minRating));
  }

  const orderBy: Record<string, string> = {
    recommended: "s.is_featured DESC, s.rating_avg DESC, s.rating_count DESC",
    rating: "s.rating_avg DESC, s.rating_count DESC",
    price_asc: "(SELECT MIN(price) FROM treatments t WHERE t.spa_id = s.id AND t.status='active') ASC",
    price_desc: "(SELECT MAX(price) FROM treatments t WHERE t.spa_id = s.id AND t.status='active') DESC",
    popular: "s.rating_count DESC",
    newest: "s.created_at DESC",
  };
  const sort = orderBy[sp.sort || "recommended"] || orderBy.recommended;

  const whereSql = where.join(" AND ");
  const rows = db
    .prepare(
      `SELECT s.id, s.slug, s.name, s.city, s.country, s.cover_url, s.rating_avg, s.rating_count,
              s.spa_types, s.description, s.is_featured,
              (SELECT MIN(price) FROM treatments t WHERE t.spa_id = s.id AND t.status='active') price_from,
              (SELECT currency FROM treatments t WHERE t.spa_id = s.id AND t.status='active') currency,
              (SELECT COUNT(*) FROM treatments t WHERE t.spa_id = s.id AND t.status='active') treatment_count
         FROM spas s JOIN suppliers sup ON sup.id = s.supplier_id
        WHERE ${whereSql}
        ORDER BY ${sort}
        LIMIT 60`
    )
    .all(...params) as any[];

  const categories = db.prepare("SELECT slug, name FROM treatment_categories ORDER BY sort").all();
  const spaTypes: [string, string][] = [
    ["day-spa", "Day Spa"],
    ["hotel-spa", "Hotel Spa"],
    ["mobile", "Mobile / Doorstep"],
    ["wellness-center", "Wellness Center"],
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <p className="eyebrow">Explore</p>
      <h1 className="font-display mt-1 text-3xl font-bold">
        {q ? `“${q}”` : location ? `Spas in ${location}` : "All spas & treatments"}
      </h1>

      <ExploreClient
        categories={categories as any}
        spaTypes={spaTypes}
        sorts={SORTS}
        active={{ q, location, category: sp.category, spaType: sp.spaType, serviceType: sp.serviceType, minRating: sp.minRating, sort: sp.sort }}
      />

      <div className="mt-6">
        {rows.length === 0 ? (
          <div className="card p-10 text-center">
            <div className="font-display text-xl font-bold">No spas match those filters</div>
            <p className="mt-2 text-ink-soft">Try widening your search — or browse all destinations.</p>
            <Link href="/explore" className="btn btn-primary mt-4">Clear filters</Link>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((s) => (
              <SpaCard key={s.id} spa={s} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
