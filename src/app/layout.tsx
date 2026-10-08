import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "http://localhost:3000"),
  title: {
    default: "Book Your Spa — Discover. Compare. Book. Relax.",
    template: "%s | Book Your Spa",
  },
  description:
    "Book Your Spa is the world's premier spa & wellness marketplace. Discover, compare and book spas, treatments and doorstep massage in Bali, Indonesia and beyond.",
  openGraph: {
    type: "website",
    siteName: "Book Your Spa",
    title: "Book Your Spa — Discover. Compare. Book. Relax.",
    description: "The world's premier spa platform. Real-time availability, trusted spas, instant booking.",
    url: "/",
  },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-[#e8e2d3] bg-white">
          <div className="mx-auto max-w-7xl px-4 py-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <div>
              <div className="font-display text-lg font-bold text-jade">Book Your Spa</div>
              <p className="mt-2 text-ink-soft">Discover. Compare. Book. Relax. The world&apos;s premier spa &amp; wellness marketplace.</p>
            </div>
            <div>
              <div className="eyebrow mb-3">Explore</div>
              <ul className="space-y-2 text-ink-soft">
                <li><Link className="hover:text-jade" href="/spa/bali">Spas in Bali</Link></li>
                <li><Link className="hover:text-jade" href="/spa/seminyak">Spas in Seminyak</Link></li>
                <li><Link className="hover:text-jade" href="/spa/ubud">Spas in Ubud</Link></li>
                <li><Link className="hover:text-jade" href="/explore">All destinations</Link></li>
              </ul>
            </div>
            <div>
              <div className="eyebrow mb-3">Popular treatments</div>
              <ul className="space-y-2 text-ink-soft">
                <li><Link className="hover:text-jade" href="/treatment/balinese-massage">Balinese Massage</Link></li>
                <li><Link className="hover:text-jade" href="/treatment/aromatherapy-massage">Aromatherapy Massage</Link></li>
                <li><Link className="hover:text-jade" href="/treatment/couples-massage">Couples Massage</Link></li>
                <li><Link className="hover:text-jade" href="/treatment/four-hand-massage">Four Hand Massage</Link></li>
              </ul>
            </div>
            <div>
              <div className="eyebrow mb-3">Partners</div>
              <ul className="space-y-2 text-ink-soft">
                <li><Link className="hover:text-jade" href="/list-your-spa">List your spa</Link></li>
                <li><Link className="hover:text-jade" href="/supplier-guide">Supplier guide</Link></li>
                <li><Link className="hover:text-jade" href="/supplier">Supplier dashboard</Link></li>
                <li><Link className="hover:text-jade" href="/admin">Admin</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-[#f0ebdd] py-4 text-center text-xs text-ink-soft">
            © {new Date().getFullYear()} Book Your Spa. All rights reserved.
          </div>
        </footer>
      </body>
    </html>
  );
}
