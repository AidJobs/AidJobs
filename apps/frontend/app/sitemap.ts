import type { MetadataRoute } from 'next';
import { HOME_PATH, SITE_URL } from '@/lib/site/siteUrl';

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${SITE_URL}${HOME_PATH}`, changeFrequency: 'hourly', priority: 1 }];
}
