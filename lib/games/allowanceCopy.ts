import type { GameMode } from '@/lib/scoring/modes/types';

/**
 * Returns the catalog key suffix for the gross-scoring helper text for a
 * given game mode. Call-sites translate the key with:
 *
 *   t(`allowance.bruttoHelper.${mode}` as Parameters<typeof t>[0])
 *
 * The full catalog lives under `allowance.bruttoHelper.<mode>` in
 * messages/no.json + messages/en.json.
 *
 * Fourball matchplay, foursomes matchplay and texas scramble have their own
 * inline helper texts at their call-sites (different field names and
 * defaults) — this function still returns the generic key suffix for
 * type-completeness, but those call-sites do not use the return value.
 */
export function bruttoHelperKeyFor(mode: GameMode): `allowance.bruttoHelper.${GameMode}` {
  return `allowance.bruttoHelper.${mode}`;
}
