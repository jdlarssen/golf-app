/**
 * The curated six formats shown on the public marketing surfaces (#1265, #1267).
 *
 * One editorial list, one home: the anonymous front page (`AnonLanding`) and the
 * organiser pillar page (`/arranger-golfturnering`) both read from here, so the
 * curation can never drift into two hand-maintained copies (AGENTS.md trap 4).
 *
 * Values are `FormatGuideEntry.key` values from `buildFormatGuide.ts`'s CATALOG —
 * which for these six equal their `GameMode`, so the detail link is
 * `/spillformater/<entry.mode>`. The span is deliberate: from mates' bets (Skins,
 * Wolf) to club fare (best ball, matchplay). Consumers look each key up in the
 * catalog and drop misses, so a renamed catalog key degrades to a shorter grid
 * rather than a crash.
 */
export const FEATURED_FORMAT_KEYS = [
  'stableford',
  'texas_scramble',
  'best_ball',
  'singles_matchplay',
  'skins',
  'wolf',
] as const;
