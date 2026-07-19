import type { MetadataRoute } from 'next';
import { listPublicCourseSlugs } from '@/lib/courses/publicCourses';
import { MODE_LABELS } from '@/lib/scoring/modes/types';

/**
 * Sitemap for the public surfaces (#1023 «Vindu ut», widened in #1264): the
 * front page, the course index + every eligible course page, the format guide
 * + one page per game mode, the demo, the tournament finder and the privacy
 * page. English variants ride along as hreflang alternates.
 *
 * hreflang now carries `no` (self-reference) and `x-default` alongside `en` —
 * Google's hreflang rules require bidirectional, self-referencing annotations,
 * and the earlier en-only map failed them.
 *
 * Format slugs are derived from `MODE_LABELS` — the same source the detail
 * page's `VALID_MODES` uses — so a new game mode joins the sitemap
 * automatically. Course data comes from the days-cached anon helper (no
 * request-time APIs), so the route stays statically cacheable under
 * cacheComponents (NO `export const runtime`, known trap).
 */

const BASE = 'https://tornygolf.no';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const slugs = await listPublicCourseSlugs();

  const entry = (path: string): MetadataRoute.Sitemap[number] => ({
    url: `${BASE}${path}`,
    alternates: {
      languages: {
        no: `${BASE}${path}`,
        en: `${BASE}/en${path}`,
        'x-default': `${BASE}${path}`,
      },
    },
  });

  const formatSlugs = Object.keys(MODE_LABELS);

  return [
    entry(''),
    entry('/baner'),
    ...slugs.map((slug) => entry(`/baner/${slug}`)),
    entry('/spillformater'),
    ...formatSlugs.map((slug) => entry(`/spillformater/${slug}`)),
    entry('/demo'),
    entry('/finn-turneringer'),
    entry('/legal/privacy'),
  ];
}
