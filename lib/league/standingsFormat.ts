/**
 * How a league table writes its numbers (#2638): the season value and the
 * per-round cells, against par or as points. One home for the web table
 * (`components/league/LeagueStandingsTable.tsx`) and the app's table
 * (`native/app/src/components/league/StandingsTable.tsx`), AGENTS.md trap 4.
 *
 *  - Stableford formats and the 'points' model show plain points, with one
 *    decimal only when a tie split made them fractional.
 *  - Stroke play shows strokes to par: «E», «+3», «−5» (a minus sign, not a
 *    hyphen); the 'average' model with one decimal.
 *
 * The decimal itself is the caller's: the web formats it with the locale
 * (`formatNumber`), the app with a comma. Imports nothing on purpose: the
 * native app imports this file by relative path.
 */

/** Writes `value` with exactly `decimals` decimals in the caller's locale. */
export type FormatDecimal = (value: number, decimals: number) => string;

/** Strokes to par: «E», «+3», «−5». */
export function formatNetToPar(n: number, formatDecimal: FormatDecimal, decimals = 0): string {
  if (n === 0) return 'E';
  const abs = Math.abs(n);
  const str = decimals > 0 ? formatDecimal(abs, decimals) : String(abs);
  return n > 0 ? `+${str}` : `−${str}`;
}

/** Plain points, one decimal only when fractional (a tie split). */
export function formatPoints(value: number, formatDecimal: FormatDecimal): string {
  return Number.isInteger(value) ? String(value) : formatDecimal(value, 1);
}

/** The season value column per model. */
export function formatSeasonValue(
  value: number,
  model: string,
  pointsBased: boolean,
  formatDecimal: FormatDecimal,
): string {
  if (model === 'points' || pointsBased) return formatPoints(value, formatDecimal);
  if (model === 'average') return formatNetToPar(value, formatDecimal, 1);
  return formatNetToPar(Math.round(value), formatDecimal);
}

/**
 * One round's cell: the cell's points under the 'points' model, its value
 * otherwise, and null when the round has no value for the player.
 */
export function roundCellValue(
  cell: { value: number | null; points: number | null } | undefined,
  model: string,
): number | null {
  if (!cell) return null;
  return model === 'points' ? cell.points : cell.value;
}

/** One round's cell as text: points, or strokes to par. */
export function formatRoundCell(
  raw: number,
  model: string,
  pointsBased: boolean,
  formatDecimal: FormatDecimal,
): string {
  return model === 'points' || pointsBased
    ? formatPoints(raw, formatDecimal)
    : formatNetToPar(raw, formatDecimal);
}
