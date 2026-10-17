/**
 * Listing & bookable-item taxonomies.
 * KEEP IN SYNC with web/src/lib/taxonomy.ts — the web copy drives the supplier
 * form chips/selects, this copy validates what the API accepts.
 */

export const SPA_CATEGORIES = [
  'day-spa', 'hotel-resort-spa', 'massage-on-call', 'wellness-center', 'beauty-spa', 'medical-spa',
] as const;

export const SPA_TYPES = [
  'massages', 'body-treatment', 'facials-skincare', 'beauty-treatment', 'sauna-thermal',
  'hydrotherapy', 'hammam-bath-ritual', 'wellness-therapies', 'yoga-pilates', 'foot-care-reflexology',
  'relaxation-healing', 'retreats-packages', 'couples-romantic', 'sensual-wellness',
] as const;

export const GENRES = ['both', 'men', 'women'] as const;

export const DELIVERY_TYPES = ['both', 'in-spa', 'doorstep'] as const;

/** Legacy treatment categories (marketplace browse filters) kept for back-compat. */
export const LEGACY_CATEGORIES = ['massage', 'skincare', 'body', 'thermal', 'hydro', 'wellness'] as const;

/** Derives the legacy browse category from a fine-grained spa type so old filters keep working. */
export const legacyCategoryFor = (spaType: string): string => {
  switch (spaType) {
    case 'massages':
    case 'foot-care-reflexology':
    case 'couples-romantic':
      return 'massage';
    case 'facials-skincare':
    case 'beauty-treatment':
      return 'skincare';
    case 'body-treatment':
    case 'hammam-bath-ritual':
      return 'body';
    case 'sauna-thermal':
      return 'thermal';
    case 'hydrotherapy':
      return 'hydro';
    default:
      return 'wellness';
  }
};

export const onlyValid = (values: unknown, allow: readonly string[], max: number): string[] => {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  for (const v of values) {
    const s = String(v);
    if (allow.includes(s) && !out.includes(s)) out.push(s);
    if (out.length >= max) break;
  }
  return out;
};
