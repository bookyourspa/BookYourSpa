import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { BookingFlow } from "@/components/BookingFlow";

export const dynamic = "force-dynamic";

export const metadata = { title: "Book your treatment", robots: { index: false } };

interface Ctx {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function BookPage({ params, searchParams }: Ctx) {
  const { slug } = await params;
  const sp = await searchParams;
  const db = getDb();

  const spa = db
    .prepare(
      `SELECT s.*, sup.status supplier_status FROM spas s
         JOIN suppliers sup ON sup.id = s.supplier_id
        WHERE s.slug = ? AND s.status='published' AND sup.status='approved'`
    )
    .get(slug) as any;
  if (!spa) notFound();

  const branches = db.prepare("SELECT id, name, address FROM branches WHERE spa_id = ? AND status='active'").all(spa.id) as any[];
  const treatments = db
    .prepare("SELECT * FROM treatments WHERE spa_id = ? AND status='active' ORDER BY name")
    .all(spa.id) as any[];
  const therapists = db
    .prepare("SELECT id, name, gender, specialty, photo_url FROM therapists WHERE spa_id = ? AND status='active' ORDER BY name")
    .all(spa.id) as any[];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-ink-soft" aria-label="Breadcrumb">
        <Link href="/">Home</Link> / <Link href={`/spa/${spa.slug}`}>{spa.name}</Link> / <span>Book</span>
      </nav>
      <BookingFlow
        spa={spa}
        branches={branches}
        treatments={treatments}
        therapists={therapists}
        initial={{
          treatmentId: sp.treatment ? Number(sp.treatment) : undefined,
          branchId: sp.branch ? Number(sp.branch) : undefined,
          date: sp.date,
          time: sp.time,
          guests: sp.guests ? Number(sp.guests) : undefined,
          serviceType: sp.service as "in_spa" | "doorstep" | undefined,
          therapistId: sp.therapist ? Number(sp.therapist) : undefined,
        }}
      />
    </div>
  );
}
