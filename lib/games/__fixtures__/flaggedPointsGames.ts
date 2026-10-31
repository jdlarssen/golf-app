import { computeLeaderboard } from '@/lib/scoring';
import type {
  GameMode,
  GameModeConfig,
  ModeResult,
  ScoringHoleScore,
  ScoringPlayer,
} from '@/lib/scoring/modes/types';

/**
 * #2738: the engine's results for the points formats as the games #2625
 * stamped carry them (`ranking: 'net_to_par'`, from 21.10 to 31.10.2026).
 * Every surface should show these games' points and rank them on points.
 *
 * Mid-round on par 4s, CH 0: u1 (or team 1) has 20 points after 9 holes, two
 * birdies and seven pars; u2 (or team 2) 22 after 12, ten pars and two
 * bogeys. Against par pace u1 would lead (+2 against −2); on points u2 leads.
 * In modified stableford u1 has 4 points and u2 −2, so u1 leads there.
 *
 * `prodRound` mirrors the round of 30.10: 25, 25 and 20 points, the two 25s
 * split on the back nine (13 against 12).
 */

const HOLES = Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, strokeIndex: i + 1 }));
const AFTER_9 = [3, 3, 4, 4, 4, 4, 4, 4, 4];
const AFTER_12 = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5, 5];

const card = (userId: string, gross: number[]): ScoringHoleScore[] =>
  gross.map((g, i) => ({ userId, holeNumber: i + 1, gross: g }));
const worse = (gross: number[]) => gross.map((g) => g + 1);

const player = (userId: string, teamNumber: number | null = null): ScoringPlayer => ({
  userId,
  teamNumber,
  flightNumber: teamNumber,
  courseHandicap: 0,
});

function compute(
  gameMode: GameMode,
  modeConfig: Record<string, unknown>,
  players: ScoringPlayer[],
  scores: ScoringHoleScore[],
): ModeResult {
  const mode_config = { ...modeConfig, ranking: 'net_to_par' } as GameModeConfig;
  return computeLeaderboard({ game: { id: 'g', game_mode: gameMode, mode_config }, players, holes: HOLES, scores });
}

const soloScores = [...card('u1', AFTER_9), ...card('u2', AFTER_12)];
// Partners one stroke worse, so the first card is the team's on every hole.
const pairScores = [
  ...card('u1', AFTER_9),
  ...card('u2', worse(AFTER_9)),
  ...card('u3', AFTER_12),
  ...card('u4', worse(AFTER_12)),
];
const pairs = [player('u1', 1), player('u2', 1), player('u3', 2), player('u4', 2)];

/** Points per hole on a par 4 with CH 0, as gross (2 → 4, 1 → 5, 0 → 6). */
const grossFor = (points: number[]) => points.map((p) => 6 - p);

export const FLAGGED_POINTS = {
  solo: compute('stableford', { kind: 'stableford', team_size: 1, points_table: 'standard' }, [player('u1'), player('u2')], soloScores),
  team: compute('stableford', { kind: 'stableford', team_size: 2, points_table: 'standard' }, pairs, pairScores),
  modifiedSolo: compute(
    'modified_stableford',
    { kind: 'modified_stableford', team_size: 1, points_table: 'modified' },
    [player('u1'), player('u2')],
    soloScores,
  ),
  // The captain (lex-min userId: u1, u3) owns the team ball from hole 7.
  patsome: compute('patsome', { kind: 'patsome', team_size: 2, teams_count: 2, patsome_scoring: 'net' }, pairs, pairScores),
  prodRound: compute(
    'stableford',
    { kind: 'stableford', team_size: 1, points_table: 'standard' },
    [player('u3'), player('u2'), player('u1')],
    [
      ...card('u1', grossFor([2, 2, 2, 2, 1, 1, 1, 1, 0, 2, 2, 2, 2, 1, 1, 1, 1, 1])), // 12 + 13
      ...card('u2', grossFor([2, 2, 2, 2, 1, 1, 1, 1, 1, 2, 2, 2, 2, 1, 1, 1, 1, 0])), // 13 + 12
      ...card('u3', grossFor([2, 2, 1, 1, 1, 1, 1, 1, 0, 2, 2, 1, 1, 1, 1, 1, 1, 0])), // 10 + 10
    ],
  ),
} satisfies Record<string, ModeResult>;
