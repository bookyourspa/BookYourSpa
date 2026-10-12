export const dynamic = 'force-static';

import type { MetadataRoute } from 'next';
import { SITE, SPAS, DESTINATIONS } from '@/lib/content';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const base = [
    '/', '/spas/', '/treatments/', '/packages/', '/offers/', '/destinations/', '/faq/', '/contact/', '/about/',
  ].map((p) => ({ url: `${SITE.url}${p}`, lastModified: now, changeFrequency: 'weekly' as const, priority: p === '/' ? 1 : 0.8 }));

  return [
    ...base,
    ...SPAS.map((s) => ({
      url: `${SITE.url}/spas/${s.slug}/`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    })),
    ...DESTINATIONS.map((d) => ({
      url: `${SITE.url}/destinations/${d.slug}/`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
  ];
}
