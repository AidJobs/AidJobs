import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site/siteUrl';

/** Every crawler is welcome, AI crawlers included, except Bytespider (UX-08 item 6). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: 'Bytespider', disallow: '/' },
      { userAgent: '*', allow: '/', disallow: '/api/' },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
