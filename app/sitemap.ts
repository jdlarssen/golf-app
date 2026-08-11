import type { MetadataRoute } from 'next';
import { listPublicCourseSlugs } from '@/lib/courses/publicCourses';
import { MODE_LABELS } from '@/lib/scoring/modes/types';
import { ARRANGE_AUDIENCES } from '@/lib/seo/arrangeAudiences';

/**
 * Sitemap for the public surfaces (#1023, epic #1021 «Vindu ut»; extended
 * #1264 with the format guide + remaining public pages). Covers: the front
 * page, the course index + every eligible course page, the format guide
 * index + one page per `GameMode` (derived from `MODE_LABELS` — the same
 * source as the detail page's `VALID_MODES`, so a new mode gets a sitemap
 * entry automatically), the organiser pillar page `/arranger-golfturnering`
 * plus its three audience subpages (derived from `ARRANGE_AUDIENCES`, the same
 * source as the subpage route's valid-slug set — #1267), the comparison page
 * `/hvorfor-torny` (#1419), `/demo`, `/finn-turneringer` and `/legal/privacy`.
 * English variants ride along as hreflang alternates (routing: default
 * locale unprefixed, en under /en). Every entry also declares a self- and
 * x-default-reference — Google's hreflang rules require bidirectionality,
 * which an en-only `languages` map does not satisfy. Course data comes from
 * the days-cached anon helper — no request-time APIs, so the route stays
 * statically cacheable under cacheComponents (NO `export const runtime`,
 * known trap).
 */

const BASE = 'https://tornygolf.no';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const slugs = await listPublicCourseSlugs();
  const modes = Object.keys(MODE_LABELS);

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

  return [
    entry(''),
    entry('/baner'),
    ...slugs.map((slug) => entry(`/baner/${slug}`)),
    entry('/spillformater'),
    ...modes.map((mode) => entry(`/spillformater/${mode}`)),
    entry('/arranger-golfturnering'),
    ...ARRANGE_AUDIENCES.map((audience) =>
      entry(`/arranger-golfturnering/${audience}`),
    ),
    entry('/hvorfor-torny'),
    entry('/demo'),
    entry('/finn-turneringer'),
    entry('/legal/privacy'),
  ];
}
