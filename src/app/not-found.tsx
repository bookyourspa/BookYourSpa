import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="eyebrow">404</p>
      <h1 className="font-display mt-2 text-4xl font-bold">Page not found</h1>
      <p className="mt-3 text-ink-soft">
        The page you&apos;re looking for doesn&apos;t exist or has moved. Let&apos;s get you back to relaxing.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link href="/" className="btn btn-primary">Back home</Link>
        <Link href="/explore" className="btn btn-outline">Explore spas</Link>
      </div>
    </div>
  );
}
