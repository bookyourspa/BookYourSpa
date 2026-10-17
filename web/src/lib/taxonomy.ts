/**
 * Listing & bookable-item taxonomies.
 * KEEP IN SYNC with worker/src/taxonomy.ts — the worker copy validates what
 * the API accepts; this copy drives the supplier form chips and selects.
 */

export const SPA_CATEGORY_OPTIONS: { slug: string; name: string }[] = [
  { slug: 'day-spa', name: 'Day Spa' },
  { slug: 'hotel-resort-spa', name: 'Hotel & Resort Spa' },
  { slug: 'massage-on-call', name: 'Massage on Call / Doorstep Spa' },
  { slug: 'wellness-center', name: 'Wellness Center' },
  { slug: 'beauty-spa', name: 'Beauty Spa' },
  { slug: 'medical-spa', name: 'Medical Spa' },
];

export const SPA_TYPE_OPTIONS: { slug: string; name: string }[] = [
  { slug: 'massages', name: 'Massages' },
  { slug: 'body-treatment', name: 'Body Treatment' },
  { slug: 'facials-skincare', name: 'Facials & Skincare' },
  { slug: 'beauty-treatment', name: 'Beauty Treatment' },
  { slug: 'sauna-thermal', name: 'Sauna & Thermal' },
  { slug: 'hydrotherapy', name: 'Hydrotherapy' },
  { slug: 'hammam-bath-ritual', name: 'Hammam & Bath Ritual' },
  { slug: 'wellness-therapies', name: 'Wellness Therapies' },
  { slug: 'yoga-pilates', name: 'Yoga & Pilates' },
  { slug: 'foot-care-reflexology', name: 'Foot Care & Reflexology' },
  { slug: 'relaxation-healing', name: 'Relaxation & Healing' },
  { slug: 'retreats-packages', name: 'Wellness Retreats & Packages' },
  { slug: 'couples-romantic', name: 'Couples & Romantic Spa' },
  { slug: 'sensual-wellness', name: 'Sensual Wellness' },
];

export const GENRE_OPTIONS: { slug: string; name: string }[] = [
  { slug: 'both', name: 'Both' },
  { slug: 'men', name: 'Man Only' },
  { slug: 'women', name: 'Women Only' },
];

export const DELIVERY_OPTIONS: { slug: string; name: string }[] = [
  { slug: 'both', name: 'Both' },
  { slug: 'in-spa', name: 'In Spa' },
  { slug: 'doorstep', name: 'Doorstep' },
];

export const labelOf = (options: { slug: string; name: string }[], slug: string, fallback = '') =>
  options.find((o) => o.slug === slug)?.name ?? fallback;
