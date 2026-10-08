import Link from "next/link";

export const metadata = {
  title: "Supplier guide",
  description: "How spas join Book Your Spa: registration, approval, catalog setup, bookings and payouts.",
  alternates: { canonical: "/supplier-guide" },
};

const STEPS: [string, string, string][] = [
  ["1. Register", "Create your business account", "Submit your business name, contact details and a short description. The account starts as a supplier application."],
  ["2. Admin review", "Get approved", "Our team verifies your business. You'll be notified on approval — rejected applications include a reason."],
  ["3. Build your profile", "Branch, hours, facilities", "Add address, GPS coordinates, opening hours, facilities, languages and photos."],
  ["4. Add treatments", "Duration, price, rules", "Every treatment needs duration, price, guest limits, buffer time and which branches offer it. Doorstep services can add a travel fee."],
  ["5. Add therapists", "Schedules & qualifications", "Set weekly working hours, days off, and which treatments each therapist is qualified for — availability is calculated from this."],
  ["6. Receive bookings", "Confirm & manage", "New bookings appear in your calendar. Confirm, reschedule (availability is re-checked), assign therapists and mark completions."],
  ["7. Get paid", "Commission & settlement", "The platform deducts a configurable commission; your net revenue and pending payout are shown in the Finance tab."],
];

export default function SupplierGuidePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <p className="eyebrow">Supplier guide</p>
      <h1 className="font-display mt-1 text-4xl font-bold">How Book Your Spa works for spas</h1>
      <p className="mt-4 text-ink-soft">
        The customer experience is simple on purpose — all the complexity lives here in your dashboard.
      </p>

      <ol className="mt-8 space-y-5">
        {STEPS.map(([title, subtitle, body]) => (
          <li key={title} className="card p-5">
            <div className="font-display text-lg font-bold text-jade">{title}</div>
            <div className="text-sm font-semibold">{subtitle}</div>
            <p className="mt-1 text-sm text-ink-soft">{body}</p>
          </li>
        ))}
      </ol>

      <section className="mt-8 rounded-xl bg-jade p-6 text-white">
        <h2 className="font-display text-xl font-bold">Availability, explained</h2>
        <p className="mt-2 text-sm text-white/80">
          A slot only appears to customers when <em>everything</em> lines up: your opening hours, the
          branch, the treatment, enough qualified therapists with free working hours, an available
          room, no overlapping booking, and buffer time respected. That&apos;s why guests never
          book you into a clash.
        </p>
      </section>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/list-your-spa" className="btn btn-gold">Apply now</Link>
        <Link href="/supplier" className="btn btn-outline">Go to dashboard</Link>
      </div>
    </div>
  );
}
