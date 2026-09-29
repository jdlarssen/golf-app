// The classic scorecard (#2262): two nine-hole cards, UT (1–9) and INN (10–18),
// with sums under each and totals under both.
//
// The grid takes finished rows, not a handicap. The allocated strokes per hole
// already have one home in the app (`buildScorecardRows`, which follows the
// engine: allowance modes, gross choices, team cards). A second allocation
// here would drift from it, and the card would say something the leaderboard
// does not (AGENTS.md trap 4).
//
// One rule carries the file, the same as `scorecardRows.ts`: **an unknown
// number is `null`, never 0.** A played hole with unknown allocation has no
// net and no points, and it makes the net and points sums unknown too. A sum
// of half an allocation is a number nobody can use.
import { computeModifiedStablefordPoints } from '../scoring/modes/modifiedStableford';
import { computeStablefordPoints, type StablefordPointsFn } from '../scoring/modes/stableford';
import type { GameMode } from '../scoring/modes/types';

export interface ScorecardGridRow {
  holeNumber: number;
  par: number;
  /** `null` = the hole has no strokes yet. */
  strokes: number | null;
  /** Allocated strokes on the hole. `null` = unknown. */
  extra: number | null;
}

export interface ScorecardCell {
  holeNumber: number;
  par: number;
  strokes: number | null;
  net: number | null;
  points: number | null;
}

export interface ScorecardSum {
  /** Par over the whole half, played or not — the card's printed par. */
  par: number;
  /** Strokes over the played holes. */
  strokes: number;
  net: number | null;
  points: number | null;
}

export type ScorecardHalfKey = 'out' | 'in';

export interface ScorecardHalf {
  key: ScorecardHalfKey;
  cells: ScorecardCell[];
  sum: ScorecardSum;
}

export interface ScorecardGridTotals {
  played: number;
  holeCount: number;
  brutto: number;
  netto: number | null;
  points: number | null;
}

export interface ScorecardGrid {
  halves: ScorecardHalf[];
  totals: ScorecardGridTotals;
}

const LAST_OUT_HOLE = 9;

/**
 * The points table the stableford engine uses for the mode, or `null` for the
 * modes that do not count points.
 */
export function stablefordPointsFnFor(mode: GameMode): StablefordPointsFn | null {
  if (mode === 'stableford') return computeStablefordPoints;
  if (mode === 'modified_stableford') return computeModifiedStablefordPoints;
  return null;
}

function toCell(row: ScorecardGridRow, pointsFn: StablefordPointsFn | null): ScorecardCell {
  const net = row.strokes != null && row.extra != null ? row.strokes - row.extra : null;
  const points = pointsFn != null && net != null ? pointsFn({ par: row.par, netStrokes: net }) : null;
  return { holeNumber: row.holeNumber, par: row.par, strokes: row.strokes, net, points };
}

/**
 * Sum the played cells. `net`/`points` are `null` as soon as one played cell
 * lacks them; `points` is always `null` without a points function.
 */
function sumPlayed(cells: readonly ScorecardCell[], hasPoints: boolean) {
  const played = cells.filter((cell) => cell.strokes != null);
  const strokes = played.reduce((sum, cell) => sum + (cell.strokes ?? 0), 0);
  const net = played.every((cell) => cell.net != null)
    ? played.reduce((sum, cell) => sum + (cell.net ?? 0), 0)
    : null;
  const points =
    hasPoints && played.every((cell) => cell.points != null)
      ? played.reduce((sum, cell) => sum + (cell.points ?? 0), 0)
      : null;
  return { played: played.length, strokes, net, points };
}

export function buildScorecardGrid(opts: {
  rows: readonly ScorecardGridRow[];
  pointsFn: StablefordPointsFn | null;
}): ScorecardGrid {
  const hasPoints = opts.pointsFn != null;
  const cells = [...opts.rows]
    .sort((a, b) => a.holeNumber - b.holeNumber)
    .map((row) => toCell(row, opts.pointsFn));

  const halves: ScorecardHalf[] = [];
  for (const key of ['out', 'in'] as const) {
    const halfCells = cells.filter((cell) =>
      key === 'out' ? cell.holeNumber <= LAST_OUT_HOLE : cell.holeNumber > LAST_OUT_HOLE,
    );
    if (halfCells.length === 0) continue;
    const { strokes, net, points } = sumPlayed(halfCells, hasPoints);
    halves.push({
      key,
      cells: halfCells,
      sum: { par: halfCells.reduce((sum, cell) => sum + cell.par, 0), strokes, net, points },
    });
  }

  const all = sumPlayed(cells, hasPoints);
  return {
    halves,
    totals: {
      played: all.played,
      holeCount: cells.length,
      brutto: all.strokes,
      netto: all.net,
      points: all.points,
    },
  };
}
