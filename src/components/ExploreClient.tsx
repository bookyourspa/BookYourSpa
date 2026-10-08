"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

interface Props {
  categories: { slug: string; name: string }[];
  spaTypes: [string, string][];
  sorts: [string, string][];
  active: Record<string, string | undefined>;
}

/** Filter bar for /explore — updates URL query params (server renders results). */
export function ExploreClient({ categories, spaTypes, sorts, active }: Props) {
  const router = useRouter();

  const set = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(window.location.search);
      if (value) params.set(key, value);
      else params.delete(key);
      router.push(`/explore?${params.toString()}`);
    },
    [router]
  );

  const clear = () => router.push("/explore");

  return (
    <div className="mt-6 space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          key={active.q ?? ""}
          defaultValue={active.q ?? ""}
          placeholder="Search spas, treatments…"
          className="input sm:max-w-xs"
          aria-label="Search"
          onKeyDown={(e) => {
            if (e.key === "Enter") set("q", (e.target as HTMLInputElement).value);
          }}
        />
        <select
          className="input sm:w-52"
          aria-label="Category"
          value={active.category ?? ""}
          onChange={(e) => set("category", e.target.value)}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>{c.name}</option>
          ))}
        </select>
        <select
          className="input sm:w-52"
          aria-label="Spa type"
          value={active.spaType ?? ""}
          onChange={(e) => set("spaType", e.target.value)}
        >
          <option value="">All spa types</option>
          {spaTypes.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select
          className="input sm:w-52"
          aria-label="Sort"
          value={active.sort ?? "recommended"}
          onChange={(e) => set("sort", e.target.value)}
        >
          {sorts.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-ink-soft">Service:</span>
        <button
          className={`chip ${!active.serviceType ? "chip-active" : ""}`}
          onClick={() => set("serviceType", "")}
        >
          Any
        </button>
        <button
          className={`chip ${active.serviceType === "in_spa" ? "chip-active" : ""}`}
          onClick={() => set("serviceType", "in_spa")}
        >
          At spa
        </button>
        <button
          className={`chip ${active.serviceType === "doorstep" ? "chip-active" : ""}`}
          onClick={() => set("serviceType", "doorstep")}
        >
          Doorstep / mobile
        </button>

        <span className="ml-3 text-ink-soft">Rating:</span>
        {[4, 4.5].map((r) => (
          <button
            key={r}
            className={`chip ${active.minRating === String(r) ? "chip-active" : ""}`}
            onClick={() => set("minRating", active.minRating === String(r) ? "" : String(r))}
          >
            ★ {r}+
          </button>
        ))}

        <button className="ml-auto text-xs font-semibold text-jade hover:underline" onClick={clear}>
          Clear all filters
        </button>
      </div>
    </div>
  );
}
