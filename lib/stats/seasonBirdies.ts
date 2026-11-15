/**
 * The birdie count behind the honour board's «Flest birdies» (#2259). Pure, so the
 * counting rule is tested without a database; `getSeasonStrokes.ts` reads the rows.
 *
 * A birdie is one under par on a hole, gross and by the player's own tee gender
 * (`countRoundAchievements`, the same rule as «Mine tall» and the Kavalkade).
 */
import type { CourseHoleRow } from '@/lib/supabase/queryFragments';
import { modeCollapsesToTeamCard, type GameMode, type ScoringGender } from '@/lib/scoring/modes/types';
import { countRoundAchievements, toHoleScores } from '@/lib/stats/achievements';

export type BirdieGame = {
  id: string;
  gameMode: GameMode;
  courseId: string | null;
  /** A derived game owns no scores; they live on the host game. */
  derived: boolean;
};

export type BirdiePlayer = {
  gameId: string;
  userId: string;
  teeGender: ScoringGender | null;
  withdrawn: boolean;
  isGuest: boolean;
};

export type BirdieScore = {
  game_id: string;
  user_id: string;
  hole_number: number;
  strokes: number | null;
};

/**
 * Whether a game's rounds count for birdies. A team ball belongs to the team, not the
 * captain who typed it (`modeCollapsesToTeamCard`), and a derived game owns no scores.
 */
export function countsForBirdies(game: BirdieGame): boolean {
  return !game.derived && !modeCollapsesToTeamCard(game.gameMode, 18);
}

/**
 * Birdies per player over `games` that `countsForBirdies` (scramble and foursomes are
 * left out, as in the Kavalkade). Withdrawn players and guests do not count.
 */
export function tallySeasonBirdies(input: {
  games: readonly BirdieGame[];
  players: readonly BirdiePlayer[];
  scores: readonly BirdieScore[];
  courseHolesByCourse: ReadonlyMap<string, ReadonlyMap<number, CourseHoleRow>>;
}): Array<[string, number]> {
  const counted = new Map(
    input.games.filter(countsForBirdies).map((game) => [game.id, game]),
  );

  const scoresByPlayer = new Map<string, BirdieScore[]>();
  for (const score of input.scores) {
    const key = `${score.game_id}:${score.user_id}`;
    const list = scoresByPlayer.get(key);
    if (list) list.push(score);
    else scoresByPlayer.set(key, [score]);
  }

  const birdies = new Map<string, number>();
  for (const player of input.players) {
    const game = counted.get(player.gameId);
    if (!game || player.withdrawn || player.isGuest) continue;
    const scores = scoresByPlayer.get(`${player.gameId}:${player.userId}`);
    if (!scores) continue;
    const courseHoles = game.courseId ? input.courseHolesByCourse.get(game.courseId) : undefined;
    const { birdie } = countRoundAchievements(toHoleScores(scores, courseHoles, player.teeGender));
    if (birdie > 0) birdies.set(player.userId, (birdies.get(player.userId) ?? 0) + birdie);
  }
  return Array.from(birdies.entries());
}
