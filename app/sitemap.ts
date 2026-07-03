import type { MetadataRoute } from 'next';
import { listPublicCourseSlugs } from '@/lib/courses/publicCourses';

/**
 * Sitemap for the public surfaces (#1023, epic #1021 «Vindu ut»): the front
 * page, the course index and every eligible course page. English variants
 * ride along as hreflang alternates (routing: default locale unprefixed,
 * en under /en). Course data comes from the days-cached anon helper — no
 * request-time APIs, so the route stays statically cacheable under
 * cacheComponents (NO `export const runtime`, known trap).
 */

const BASE = 'https://tornygolf.no';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const slugs = await listPublicCourseSlugs();

  const entry = (path: string): MetadataRoute.Sitemap[number] => ({
    url: `${BASE}${path}`,
    alternates: {
      languages: { en: `${BASE}/en${path}` },
    },
  });

  return [
    { ...entry(''), url: BASE },
    entry('/baner'),
    ...slugs.map((slug) => entry(`/baner/${slug}`)),
  ];
}
