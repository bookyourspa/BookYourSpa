import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, Jost } from 'next/font/google';
import { AuthProvider } from '@/lib/auth';
import { SITE } from '@/lib/content';
import './globals.css';

const display = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-cormorant',
  display: 'swap',
});

const sans = Jost({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-jost',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: 'BookYourSpa — Luxury Spa & Wellness Booking',
    template: '%s | BookYourSpa',
  },
  description:
    'Discover and book luxury spas, signature massages and restorative wellness treatments worldwide. Real-time availability, secure payment, instant confirmation.',
  keywords: ['spa booking', 'luxury spa', 'massage booking', 'wellness treatments', 'spa packages', 'book spa online'],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'BookYourSpa',
    title: 'BookYourSpa — Where stillness becomes an art',
    description: 'Reserve exceptional spas, signature massages and restorative rituals in the world’s most beautiful destinations.',
    url: SITE.url,
    images: [{ url: '/images/hero/hero-spa.jpg', width: 1920, height: 1080, alt: 'Luxury spa pool at golden hour' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BookYourSpa — Luxury Spa & Wellness Booking',
    description: 'Reserve exceptional spas and restorative rituals worldwide, in under sixty seconds.',
    images: ['/images/hero/hero-spa.jpg'],
  },
  robots: { index: true, follow: true },
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = {
  themeColor: '#101c16',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="min-h-screen antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
