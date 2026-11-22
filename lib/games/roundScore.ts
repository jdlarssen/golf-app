import { COMPLETE_ROUND_HOLES } from '@/lib/stats/playerStats';

/**
 * Brutto + netto for one finished round, computed from the player's own stroke
 * entries and their course handicap. Single source of truth for the
 * «Runder»-row numbers — shared by Hjem (#986), Profil → Historikk, the
 * Kavalkade and the app, so the surfaces can't drift apart.
 *
 * - `brutto`: sum of entered strokes (a `null` stroke counts as 0), or `null`
 *   when the player has no score rows for the round at all.
 * - `netto`: `brutto − courseHandicap` for a full 18-hole round, otherwise
 *   `null`. The stored course handicap is the 18-hole number, also in a
 *   front-nine or back-nine match, so taking it off fewer holes showed a net
 *   score far below par (audit 2026-11-20: 9 holes, 62 strokes, CH 43 gave
 *   «netto 19»). A 9-hole course played twice has 18 holes and counts.
 */
export function computeRoundScore(
  strokes: ReadonlyArray<number | null>,
  courseHandicap: number | null,
): { brutto: number | null; netto: number | null } {
  const brutto =
    strokes.length > 0
      ? strokes.reduce<number>((acc, s) => acc + (s ?? 0), 0)
      : null;
  const played = strokes.filter((s) => s != null).length;
  const netto =
    brutto != null && courseHandicap != null && played === COMPLETE_ROUND_HOLES
      ? brutto - courseHandicap
      : null;
  return { brutto, netto };
}
