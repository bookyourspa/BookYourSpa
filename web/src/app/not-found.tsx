import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="flex min-h-[80vh] flex-col items-center justify-center px-6 py-40 text-center">
      <p className="eyebrow">404</p>
      <h1 className="mt-4 font-display text-5xl sm:text-6xl">This room is quiet — too quiet</h1>
      <p className="mt-4 max-w-md text-stone">The page you were looking for has been retired, renamed or never existed. The spa collection, however, is right this way.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/" className="btn-gold">Back home</Link>
        <Link href="/spas/" className="btn-outline">Browse spas</Link>
      </div>
    </section>
  );
}
