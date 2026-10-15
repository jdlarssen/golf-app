// The live team board (#2579): scramble (texas, ambrose, florida), team
// stableford, shamble and best ball. Pure code like `liveBoard.ts`: no React,
// no translations, so the app (native/app) and later the web read the same
// numbers.
//
// It never ranks by itself. Rank, total, N and the gap come from the engine
// through `teamResultBoard` and `teamBoardMeasure` (`resultBoard.ts`); this
// adds the tone per hole, the movement since each team's latest hole, and the
// models for «DITT LAG PÅ HULL N».

import { playOrder } from '@/lib/games/nextHole';
import type { StartType } from '@/lib/games/startType';
import { strokeTerm, type StrokeTerm } from '@/lib/scorecard/scoreRail';
import type { HoleSegment } from '@/lib/scoring/holeSegment';
import type { BestBallResult, TexasScrambleResult } from '@/lib/scoring/modes/types';
import { vsParTone, type VsParTone } from './bestBallHoles';
import { teamResultBoard, type ResultBoard, type TeamBoardResult, type TeamResultBoardRow } from './resultBoard';

/** A hole's colour on the team board; `unset` is a hole the team has not played. */
export type TeamHoleTone = VsParTone | 'unset';

/** The unit under the total and in the band's line: net, gross (shamble) or points. */
export type TeamDisplayUnit = 'net' | 'gross' | 'points';

const RECENT_HOLES = 5;
/** Played holes before a team gets movement, as on the solo board. */
const MIN_HOLES_FOR_MOVEMENT = 2;

export function teamDisplayUnit(result: TeamBoardResult): TeamDisplayUnit {
  if (result.kind === 'stableford') return 'points';
  if (result.kind === 'shamble') return result.scoring === 'gross' ? 'gross' : 'net';
  return 'net';
}

/**
 * Each hole's tone for one team, in hole order. Net in every net format;
 * shamble against the par of every counted ball; team stableford from the
 * lowest net of the players who played the hole (the lowest net gives the
 * most points in both points tables).
 */
export function teamHoleTones(
  result: TeamBoardResult,
  teamNumber: number,
): { holeNumber: number; tone: TeamHoleTone }[] {
  switch (result.kind) {
    case 'texas_scramble':
      return netTones(result.teams.find((t) => t.teamNumber === teamNumber)?.holes ?? []);
    case 'best_ball':
      return netTones(result.teams.find((t) => t.teamNumber === teamNumber)?.holes ?? []);
    case 'shamble':
      return result.holes.map((h) => {
        const cell = h.teams.find((c) => c.teamNumber === teamNumber);
        return {
          holeNumber: h.holeNumber,
          tone:
            !cell || cell.pending || cell.teamScore === null
              ? 'unset'
              : vsParTone(cell.teamScore - result.count * h.par),
        };
      });
    case 'stableford': {
      const team = result.teams.find((t) => t.teamNumber === teamNumber);
      return (team?.holes ?? []).map((h) => {
        const nets = h.players.filter((p) => p.gross !== null && p.netStrokes !== null).map((p) => p.netStrokes as number);
        return { holeNumber: h.holeNumber, tone: nets.length === 0 ? 'unset' : vsParTone(Math.min(...nets) - h.par) };
      });
    }
  }
}

/** The team's net against par per hole (texas and best ball rows). */
function netTones(
  holes: readonly { holeNumber: number; par: number; teamNet: number | null }[],
): { holeNumber: number; tone: TeamHoleTone }[] {
  return holes.map((h) => ({
    holeNumber: h.holeNumber,
    tone: h.teamNet === null ? 'unset' : vsParTone(h.teamNet - h.par),
  }));
}

export type TeamLiveRow = TeamResultBoardRow & {
  /** Place before the team's latest hole − place now; `null` under two holes. */
  movement: number | null;
  /** Every hole in the result, in hole order (best ball draws all of 1–9). */
  tones: { holeNumber: number; tone: TeamHoleTone }[];
  /** Up to the last five played holes, oldest first. */
  recent: TeamHoleTone[];
};

/**
 * The live team board: the finished board's rows (`teamResultBoard`) plus the
 * movement against `previous` (the same game without each team's latest
 * hole, `withoutLatestHolePerTeam`) and the hole tones.
 */
export function teamLiveBoard(
  now: TeamBoardResult,
  previous: TeamBoardResult | null,
  teamName: (teamNumber: number) => string,
): ResultBoard<TeamLiveRow> {
  const board = teamResultBoard(now, teamName);
  const before = previous
    ? new Map(teamResultBoard(previous, teamName).rows.map((r) => [r.teamNumber, r.rank]))
    : new Map<number, number>();
  return {
    ...board,
    rows: board.rows.map((row) => {
      const tones = teamHoleTones(now, row.teamNumber);
      const rankBefore = before.get(row.teamNumber);
      return {
        ...row,
        movement:
          row.holesPlayed < MIN_HOLES_FOR_MOVEMENT || rankBefore === undefined ? null : rankBefore - row.rank,
        tones,
        recent: tones.filter((h) => h.tone !== 'unset').slice(-RECENT_HOLES).map((h) => h.tone),
      };
    }),
  };
}

/**
 * Drops every member's row on each team's latest played hole, in the order
 * the holes are played (`playOrder`). Rows without strokes stay; they count
 * for nothing either way. The previous result for the movement is computed
 * over these rows.
 */
export function withoutLatestHolePerTeam<T extends { user_id: string; hole_number: number; strokes: number | null }>(
  rows: readonly T[],
  teamOf: (userId: string) => number | null,
  segment: HoleSegment = 'full',
  startType: StartType = 'first_tee',
): T[] {
  const filled = new Map<number, Set<number>>();
  for (const r of rows) {
    const team = teamOf(r.user_id);
    if (team === null || r.strokes == null) continue;
    const holes = filled.get(team) ?? new Set<number>();
    holes.add(r.hole_number);
    filled.set(team, holes);
  }
  const latest = new Map<number, number>();
  for (const [team, holes] of filled) {
    const last = [...playOrder(segment, startType, holes)].reverse().find((h) => holes.has(h));
    if (last !== undefined) latest.set(team, last);
  }
  return rows.filter((r) => {
    const team = teamOf(r.user_id);
    return r.strokes == null || team === null || latest.get(team) !== r.hole_number;
  });
}

/** «DITT LAG PÅ HULL N» for the scramble family: the strokes the team hit, and their word. */
export type ScrambleHoleCard = { holeNumber: number; strokes: number; term: StrokeTerm; overPar: number };

/**
 * The team's last played hole (hole order from hole 1; the app does not know
 * a shotgun start): gross strokes and the word for them, both on gross so
 * the number and the word describe the same score.
 */
export function scrambleHoleCard(result: TexasScrambleResult, teamNumber: number): ScrambleHoleCard | null {
  const team = result.teams.find((t) => t.teamNumber === teamNumber);
  const last = team ? [...team.holes].reverse().find((h) => h.teamGross !== null) : undefined;
  if (!last || last.teamGross === null) return null;
  return {
    holeNumber: last.holeNumber,
    strokes: last.teamGross,
    term: strokeTerm(last.teamGross, last.par),
    overPar: last.teamGross - last.par,
  };
}

/** «Ballen til X talte · netto 6, bogey» for best ball. */
export type BestBallHoleCard = {
  holeNumber: number;
  net: number;
  term: StrokeTerm;
  overPar: number;
  contributorIds: string[];
};

/**
 * The team's last played hole in the result it gets (the first half while the
 * board is clipped): the team's net, the word on that net, and whose ball
 * counted (both when they tie).
 */
export function bestBallHoleCard(result: BestBallResult, teamNumber: number): BestBallHoleCard | null {
  const team = result.teams.find((t) => t.teamNumber === teamNumber);
  const last = team ? [...team.holes].reverse().find((h) => h.teamNet !== null) : undefined;
  if (!last || last.teamNet === null) return null;
  return {
    holeNumber: last.holeNumber,
    net: last.teamNet,
    term: strokeTerm(last.teamNet, last.par),
    overPar: last.teamNet - last.par,
    contributorIds: last.contributorIds,
  };
}
