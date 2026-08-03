/**
 * The three audience subpages under the «Arranger golfturnering» pillar (#1267).
 *
 * One home, three consumers: the dynamic route's valid-slug set, the hub's
 * audience cards, and `app/sitemap.ts`. A second hand-maintained copy of this
 * list is exactly the drift AGENTS.md trap 4 warns about, so there is none —
 * adding a fourth audience means adding a value here plus its catalog entry.
 *
 * Each value doubles as the URL slug (`/arranger-golfturnering/<slug>`) and as
 * the key under `arrangeGuide.audiences` in the message catalog, so the route
 * reads its copy with the very string it matched — a valid slug can never point
 * at missing copy. Slugs stay Norwegian in every locale, matching the rest of
 * the public surfaces (`/spillformater`, `/finn-turneringer`).
 */
export const ARRANGE_AUDIENCES = [
  'firmagolf',
  'vennegjeng',
  'klubbkveld',
] as const;

export type ArrangeAudience = (typeof ARRANGE_AUDIENCES)[number];
