import Link from "next/link";

export default function Forbidden() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="eyebrow">403</p>
      <h1 className="font-display mt-2 text-4xl font-bold">Access denied</h1>
      <p className="mt-3 text-ink-soft">
        You don&apos;t have permission to view this page. Log in with the right account and try again.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link href="/login" className="btn btn-primary">Log in</Link>
        <Link href="/" className="btn btn-outline">Back home</Link>
      </div>
    </div>
  );
}
