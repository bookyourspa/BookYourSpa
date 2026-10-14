export const dynamic = 'force-static';

import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/content';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: ['/admin', '/supplier', '/api'] },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
