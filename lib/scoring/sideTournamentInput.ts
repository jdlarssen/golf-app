// lib/scoring/sideTournamentInput.ts
// Pure function that builds a SideTournamentInput from the computed leaderboard
// output and course metadata. Extracted from the leaderboard page (#942) so the
// same input can be constructed server-side for the shareable result-card image
// without duplicating the logic.

import type { TeamLine } from '@/lib/leaderboard';
import type { SideCategoryId } from './sideTournamentConfig';
import type { SideTournamentInput, SideWinner } from './sideTournament';
import type { SideWinnerRow } from '@/app/[locale]/games/[id]/leaderboard/leaderboardTypes';

/**
 * Builds the 18-element par + stroke-index arrays a {@link SideTournamentInput}
 * needs, resolved by hole-number so sparse course data (missing rows) leaves
 * predictable fallbacks rather than silently shifting values onto the wrong hole.
 *
 * Fallback discipline — kept identical across every side-tournament call site:
 *  - `coursePars`  → `?? 4`, keeping the array dense for the `!= null` checks in
 *    {@link calculateSideTournament}.
 *  - `courseStrokeIndices` → `?? h` (the hole's own number); `hardest_hole_winner`
 *    gates on the resolved SI=1 hole, so a self-position fallback is safe.
 *
 * The raw `siByHole` map is returned too: the `computeSideTournament` netto loop
 * needs it for a DIFFERENT fallback (`?? 18`) than the `courseStrokeIndices`
 * array uses — the two must not be conflated, so the map is handed back unbaked.
 */
export function buildCourseArrays(
  holes: { holeNumber: number; par: number; strokeIndex: number }[],
): {
  coursePars: number[];
  courseStrokeIndices: number[];
  siByHole: Map<number, number>;
} {
  const parByHole = new Map<number, number>();
  const siByHole = new Map<number, number>();
  for (const h of holes) {
    parByHole.set(h.holeNumber, h.par);
    siByHole.set(h.holeNumber, h.strokeIndex);
  }
  const coursePars: number[] = [];
  const courseStrokeIndices: number[] = [];
  for (let h = 1; h <= 18; h++) {
    coursePars.push(parByHole.get(h) ?? 4);
    courseStrokeIndices.push(siByHole.get(h) ?? h);
  }
  return { coursePars, courseStrokeIndices, siByHole };
}

/**
 * Maps `game_side_winners` rows to the engine's {@link SideWinner}[] shape. Only
 * the two selectable LD/CTP slots (position 1 | 2) qualify; any other position
 * is dropped. `winner_user_id` (snake_case, DB) becomes `winnerUserId` (camel).
 */
export function mapSideWinners(rows: SideWinnerRow[]): SideWinner[] {
  return rows
    .filter(
      (w): w is SideWinnerRow & { position: 1 | 2 } =>
        w.position === 1 || w.position === 2,
    )
    .map((w) => ({
      category: w.category,
      position: w.position,
      winnerUserId: w.winner_user_id,
    }));
}

/**
 * Builds a {@link SideTournamentInput} from the netto leaderboard output and
 * course-hole metadata.
 *
 * Call {@link calculateSideTournament} on the returned value to compute results.
 *
 * This function is PURE — no I/O, no side effects. The logic is verbatim from
 * the leaderboard page; the only change is encapsulation into a named function
 * so both the page and the share-card route can call it without duplication.
 *
 * @param args.nettoLines  Output of `computeLeaderboard({ mode: 'netto', ... })`, any order.
 * @param args.holes       Course-hole metadata (holeNumber, par, strokeIndex).
 * @param args.ldCount     Number of longest-drive slots (0 | 1 | 2).
 * @param args.ctpCount    Number of closest-to-pin slots (0 | 1 | 2).
 * @param args.disabledCategories  Categories excluded by admin config.
 * @param args.sideWinnerRows      LD/CTP winner rows from `game_side_winners`.
 */
export function buildSideTournamentInput(args: {
  nettoLines: TeamLine[];
  holes: { holeNumber: number; par: number; strokeIndex: number }[];
  ldCount: 0 | 1 | 2;
  ctpCount: 0 | 1 | 2;
  disabledCategories: SideCategoryId[];
  sideWinnerRows: SideWinnerRow[];
}): SideTournamentInput {
  const { nettoLines, holes, ldCount, ctpCount, disabledCategories, sideWinnerRows } = args;

  // Sort teams by teamNumber for stable ordering (matches Lag-labels).
  const sortedNettoLines = [...nettoLines].sort(
    (a, b) => a.teamNumber - b.teamNumber,
  );

  // coursePars / courseStrokeIndices: 18-element arrays indexed by hole-1,
  // resolved by hole-number (see buildCourseArrays for the fallback discipline).
  const { coursePars, courseStrokeIndices } = buildCourseArrays(holes);

  // playerScoresPerHole: per-player 18-element brutto + netto arrays. Source of
  // truth is `sortedNettoLines` — `computeLeaderboard` already ran in netto mode,
  // so `pc.net` is the canonical strokes-adjusted netto and `pc.gross` is the
  // recorded brutto. Missing holes stay `null` (never `0`).
  type PlayerHoleAccum = {
    userId: string;
    perHoleGross: Array<number | null>;
    perHoleNetto: Array<number | null>;
  };
  const playerAccum = new Map<string, PlayerHoleAccum>();
  for (const line of sortedNettoLines) {
    for (const p of line.players) {
      if (!playerAccum.has(p.userId)) {
        playerAccum.set(p.userId, {
          userId: p.userId,
          perHoleGross: new Array<number | null>(18).fill(null),
          perHoleNetto: new Array<number | null>(18).fill(null),
        });
      }
    }
    for (const hole of line.holes) {
      // Defensive: ignore any hole-rows outside 1..18 (shouldn't happen with
      // valid course data, but guards the array index).
      const idx = hole.holeNumber - 1;
      if (idx < 0 || idx >= 18) continue;
      for (const pc of hole.players) {
        const accum = playerAccum.get(pc.userId);
        if (!accum) continue;
        accum.perHoleGross[idx] = pc.gross;
        accum.perHoleNetto[idx] = pc.net;
      }
    }
  }
  const playerScoresPerHole = Array.from(playerAccum.values());

  const sideWinners = mapSideWinners(sideWinnerRows);

  return {
    config: {
      enabled: true,
      ldCount,
      ctpCount,
      disabledCategories,
    },
    teams: sortedNettoLines.map((line) => ({
      teamId: line.teamNumber,
      userIds: line.players.map((p) => p.userId),
    })),
    coursePars,
    courseStrokeIndices,
    playerScoresPerHole,
    nettoBestBallPerHole: sortedNettoLines.map((line) => {
      // computeLeaderboard returns holes sorted 1..18 already.
      const perHoleNetto: Array<number | null> = [];
      for (let h = 1; h <= 18; h++) {
        const row = line.holes.find((rh) => rh.holeNumber === h);
        perHoleNetto.push(row?.teamNet ?? null);
      }
      return { teamId: line.teamNumber, perHoleNetto };
    }),
    sideWinners,
  };
}
