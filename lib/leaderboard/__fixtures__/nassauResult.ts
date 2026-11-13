import { computeLeaderboard } from '@/lib/scoring';
import { buildNassauContext } from '@/lib/scoring/context/buildNassauContext';
import type { GameModeConfig, NassauResult } from '@/lib/scoring/modes/types';

const HOLES = Array.from({ length: 18 }, (_, i) => ({
  hole_number: i + 1,
  par_mens: 4,
  par_ladies: 4,
  par_juniors: 4,
  stroke_index: i + 1,
}));

/**
 * A real Nassau result from the engine, for tests: `strokes[userId][i]` is the
 * gross on hole i + 1, and a shorter list means the later holes are not played
 * yet. Par 4 everywhere and handicap 0, so net equals gross and the sums are
 * easy to check by hand.
 */
export function nassauResult(
  strokes: Record<string, readonly number[]>,
  ranking?: 'net_to_par',
): NassauResult {
  const modeConfig = {
    kind: 'nassau',
    team_size: 1,
    nassau_scoring: 'net',
    ...(ranking ? { ranking } : {}),
  } as GameModeConfig;
  const result = computeLeaderboard(
    buildNassauContext({
      gameId: 'g1',
      modeConfig,
      players: Object.keys(strokes).map((id) => ({
        user_id: id,
        course_handicap: 0,
        tee_gender: 'mens' as const,
        users: { name: id, nickname: null },
      })),
      holesRows: HOLES,
      scoresRows: Object.entries(strokes).flatMap(([id, gross]) =>
        gross.map((g, i) => ({ user_id: id, hole_number: i + 1, strokes: g })),
      ),
    }),
  );
  if (result.kind !== 'nassau') throw new Error(`expected nassau, got ${result.kind}`);
  return result;
}

/** `n` holes of par. */
export const fours = (n: number): number[] => Array.from({ length: n }, () => 4);

/**
 * The artboard's round after 13 holes: everyone has played the front 9
 * (marte 33, jonas 34, meg 35, kari 38) and back 9 is under way — meg 15,
 * marte 16 and jonas 17 after four holes, kari two holes behind. Marte has
 * won the front 9 alone, so she can take all three.
 */
export const AFTER_13 = {
  meg: [3, 4, 4, 4, 4, 4, 4, 4, 4, 3, 4, 4, 4],
  marte: [3, 4, 4, 4, 4, 4, 4, 3, 3, 4, 4, 4, 4],
  jonas: [3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5, 4],
  kari: [5, 4, 5, 4, 4, 4, 4, 4, 4, 4, 4],
} as const;
