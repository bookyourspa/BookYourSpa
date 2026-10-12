'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DESTINATIONS, CATEGORIES } from '@/lib/content';
import { addDays } from '@/lib/format';

export function HeroSearch() {
  const router = useRouter();
  const [destination, setDestination] = useState('');
  const [category, setCategory] = useState('');
  const [date, setDate] = useState(addDays(7));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (destination) params.set('destination', destination);
    if (category) params.set('category', category);
    if (date) params.set('date', date);
    router.push(`/spas/?${params.toString()}`);
  };

  return (
    <form onSubmit={submit} className="card-lux grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[1.1fr_1.1fr_1fr_auto] lg:items-end lg:p-5" aria-label="Search spas">
      <label className="block">
        <span className="label-lux">Destination</span>
        <select value={destination} onChange={(e) => setDestination(e.target.value)} className="input-lux">
          <option value="">Anywhere beautiful</option>
          {DESTINATIONS.map((d) => (
            <option key={d.slug} value={d.slug}>{d.name}, {d.country}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="label-lux">Treatment</span>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="input-lux">
          <option value="">Any experience</option>
          {CATEGORIES.map((c) => (
            <option key={c.slug} value={c.slug}>{c.name}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="label-lux">Date</span>
        <input type="date" value={date} min={addDays(1)} onChange={(e) => setDate(e.target.value)} className="input-lux" />
      </label>
      <button type="submit" className="btn-gold h-[46px] w-full sm:col-span-2 lg:col-span-1 lg:w-auto">
        Search spas
      </button>
    </form>
  );
}
