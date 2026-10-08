"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="eyebrow">500</p>
      <h1 className="font-display mt-2 text-4xl font-bold">Something went wrong</h1>
      <p className="mt-3 text-ink-soft">
        An unexpected error occurred. Our team has been notified — please try again.
      </p>
      <button onClick={reset} className="btn btn-primary mt-6">Try again</button>
    </div>
  );
}
