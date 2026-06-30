/**
 * Brutto + netto for one finished round, computed from the player's own stroke
 * entries and their course handicap. Single source of truth for the
 * «Runder»-row numbers — shared by Hjem (#986) and Profil → Historikk so the
 * two surfaces can't drift apart.
 *
 * - `brutto`: sum of entered strokes (a `null` stroke counts as 0), or `null`
 *   when the player has no score rows for the round at all.
 * - `netto`: `brutto − courseHandicap`, or `null` when either is missing.
 */
export function computeRoundScore(
  strokes: ReadonlyArray<number | null>,
  courseHandicap: number | null,
): { brutto: number | null; netto: number | null } {
  const brutto =
    strokes.length > 0
      ? strokes.reduce<number>((acc, s) => acc + (s ?? 0), 0)
      : null;
  const netto =
    brutto != null && courseHandicap != null ? brutto - courseHandicap : null;
  return { brutto, netto };
}
