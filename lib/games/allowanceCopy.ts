import type { GameMode } from '@/lib/scoring/modes/types';

/**
 * Returns the catalog key for the gross-scoring helper text for a given game
 * mode, relative to the `allowance` translation scope. Call-sites translate
 * it with a scoped translator:
 *
 *   const tAllowance = useTranslations('allowance');
 *   tAllowance(bruttoHelperKeyFor(mode));   // → allowance.bruttoHelper.<mode>
 *
 * The key is relative on purpose (#927): returning the full `allowance.`-
 * prefixed path made the scoped translator resolve the doubled key
 * `allowance.allowance.bruttoHelper.<mode>` → MISSING_MESSAGE. The catalog
 * lives under `allowance.bruttoHelper.<mode>` in messages/{no,en}.json.
 *
 * Fourball matchplay, foursomes matchplay and texas scramble have their own
 * inline helper texts at their call-sites (different field names and
 * defaults) — this function still returns the generic key for
 * type-completeness, but those call-sites do not use the return value.
 */
export function bruttoHelperKeyFor(mode: GameMode): `bruttoHelper.${GameMode}` {
  return `bruttoHelper.${mode}`;
}
