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
 *
 * #2980: the round list on both surfaces shows your own cell from the same
 * table (`leagueTable`, `myRoundCell`), so the number is the table's.
 */

/** Writes `value` with exactly `decimals` decimals in the caller's locale. */
export type FormatDecimal = (value: number, decimals: number) => string;

/** Strokes to par: «E», «+3», «−5». */
export function formatNetToPar(n: number, formatDecimal: FormatDecimal, decimals = 0): string {
  if (n === 0) return 'E';
  const abs = Math.abs(n);
  // A value that rounds to zero at this precision (an average of +0.038) is
  // «E», never «+0,0».
  if (decimals > 0 && Math.round(abs * 10 ** decimals) === 0) return 'E';
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

/** Whether a round's number is points (stableford, the 'points' model) or strokes to par. */
export function isPointsCell(model: string, pointsBased: boolean): boolean {
  return model === 'points' || pointsBased;
}

/** One round's cell as text: points, or strokes to par. */
export function formatRoundCell(
  raw: number,
  model: string,
  pointsBased: boolean,
  formatDecimal: FormatDecimal,
): string {
  return isPointsCell(model, pointsBased)
    ? formatPoints(raw, formatDecimal)
    : formatNetToPar(raw, formatDecimal);
}

/**
 * The league's own axis: gross in a gross league, net otherwise ('both' is
 * legacy and ranks net first, as the web panel does). The app's table and the
 * round lists on both surfaces read it (#2980).
 */
export function leagueTable<T>(standings: { net: T | null; gross: T | null }, scoring: string): T | null {
  return (scoring === 'gross' ? standings.gross : standings.net) ?? standings.net ?? standings.gross;
}

/**
 * #2980: your own result in one round, for the round list: the number the
 * table cell shows (`roundCellValue`) and the flight whose card it came from.
 * null when the round shows nothing extra: you have no row, the round has no
 * cell, you did not play it, or the value is a penalty (there is no card
 * behind it). `gameId` is null when the caller may not open the card, and for
 * a server from before #2815.
 */
export function myRoundCell(
  rows: readonly {
    userId: string;
    perRound: readonly { roundId: string; value: number | null; points: number | null; penalised: boolean; gameId?: string | null }[];
  }[],
  userId: string | null,
  roundId: string,
  model: string,
): { raw: number; gameId: string | null } | null {
  if (userId === null) return null;
  const cell = rows.find((r) => r.userId === userId)?.perRound.find((c) => c.roundId === roundId);
  const raw = roundCellValue(cell, model);
  if (!cell || raw === null || cell.penalised) return null;
  return { raw, gameId: cell.gameId ?? null };
}

/**
 * Which rounds get a column in the table, and which of them is open now
 * (#1378). A round that has not opened yet has nothing to show, so it gets no
 * column; open and closed rounds do. The open round is the first in sequence
 * whose window holds `nowMs`. The caller passes the clock, so the server
 * decides «now» once and the client never recomputes it.
 */
export function tableRounds<T extends { id: string; sequence: number; opensAt: string; closesAt: string }>(
  rounds: readonly T[],
  nowMs: number,
): { shown: T[]; openRoundId: string | null } {
  const sorted = [...rounds].sort((a, b) => a.sequence - b.sequence);
  const shown = sorted.filter((r) => nowMs >= new Date(r.opensAt).getTime());
  const open = shown.find((r) => nowMs <= new Date(r.closesAt).getTime());
  return { shown, openRoundId: open?.id ?? null };
}

/**
 * The table's three groups, in stable order (#1378): the ranked rows, then
 * those who skipped a closed round under «must play all» (they have played, so
 * `roundsPlayed > 0`), then those who have not played a round yet.
 */
export function splitStandings<R extends { ranked: boolean; roundsPlayed: number }>(
  rows: readonly R[],
): { ranked: R[]; notRanked: R[]; notRankedYet: R[] } {
  return {
    ranked: rows.filter((r) => r.ranked),
    notRanked: rows.filter((r) => !r.ranked && r.roundsPlayed > 0),
    notRankedYet: rows.filter((r) => !r.ranked && r.roundsPlayed === 0),
  };
}
