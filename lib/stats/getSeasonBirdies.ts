import 'server-only';
import { unstable_cache } from 'next/cache';
import { getAdminClient } from '@/lib/supabase/admin';
import { selectAllRows } from '@/lib/supabase/selectAllRows';
import { chunks } from '@/lib/stats/chunks';
import { osloYearWindow } from '@/lib/format/osloCalendar';
import { COURSE_HOLES_SELECT, type CourseHoleRow } from '@/lib/supabase/queryFragments';
import type { GameMode, ScoringGender } from '@/lib/scoring/modes/types';
import {
  countsForBirdies,
  tallySeasonBirdies,
  type BirdieGame,
  type BirdiePlayer,
  type BirdieScore,
} from '@/lib/stats/seasonBirdies';

type GameRow = {
  id: string;
  game_mode: GameMode;
  course_id: string | null;
  source_game_id: string | null;
};

type PlayerRow = {
  game_id: string;
  user_id: string;
  tee_gender: ScoringGender | null;
  withdrawn_at: string | null;
  users: { is_guest: boolean } | null;
};

type CourseHoleWithCourse = CourseHoleRow & { course_id: string };

/**
 * `[userId, birdies]` for every player with at least one birdie in the finished
 * games that ended in `seasonYear` (Oslo calendar year, the same window as
 * `getFinishedGameWins`, so the two tabs of the honour board agree on «sesongen»).
 * The counting rule is `tallySeasonBirdies`; this reads the rows.
 *
 * Service-role read, like `getFinishedGameWins`: a finished game is not world-readable
 * (#1542), so the caller (`/api/aeresbrett`) is the gate and sends only counts.
 * Cached five minutes under the same tag as the win counts.
 */
export const getSeasonBirdies = unstable_cache(
  async (opts: { seasonYear: number }): Promise<Array<[string, number]>> => {
    const supabase = getAdminClient();
    const season = osloYearWindow(new Date(Date.UTC(opts.seasonYear, 6, 1)));

    const gameRows = await selectAllRows(
      (from, to) =>
        supabase
          .from('games')
          .select('id, game_mode, course_id, source_game_id')
          .eq('status', 'finished')
          .gte('ended_at', season.startIso)
          .lt('ended_at', season.endIso)
          .order('id')
          .range(from, to)
          .returns<GameRow[]>(),
      'season birdies games',
    );
    const games: BirdieGame[] = gameRows.map((g) => ({
      id: g.id,
      gameMode: g.game_mode,
      courseId: g.course_id,
      derived: g.source_game_id != null,
    }));
    // Games that cannot count are not read further; saves score rows nobody uses.
    const gameIds = games.filter(countsForBirdies).map((g) => g.id);
    if (gameIds.length === 0) return [];

    const players: BirdiePlayer[] = [];
    const scores: BirdieScore[] = [];
    for (const ids of chunks(gameIds)) {
      const playerRows = await selectAllRows(
        (from, to) =>
          supabase
            .from('game_players')
            .select('game_id, user_id, tee_gender, withdrawn_at, users!game_players_user_id_fkey(is_guest)')
            .in('game_id', ids)
            .order('game_id')
            .order('user_id')
            .range(from, to)
            .returns<PlayerRow[]>(),
        'season birdies game_players',
      );
      for (const p of playerRows) {
        players.push({
          gameId: p.game_id,
          userId: p.user_id,
          teeGender: p.tee_gender,
          withdrawn: p.withdrawn_at != null,
          isGuest: p.users?.is_guest ?? false,
        });
      }
      scores.push(
        ...(await selectAllRows(
          (from, to) =>
            supabase
              .from('scores')
              .select('game_id, user_id, hole_number, strokes')
              .in('game_id', ids)
              .order('id')
              .range(from, to)
              .returns<BirdieScore[]>(),
          'season birdies scores',
        )),
      );
    }

    const courseIds = Array.from(new Set(games.filter(countsForBirdies).map((g) => g.courseId).filter((c): c is string => c != null)));
    const courseHolesByCourse = new Map<string, Map<number, CourseHoleRow>>();
    for (const ids of chunks(courseIds)) {
      const holeRows = await selectAllRows(
        (from, to) =>
          supabase
            .from('course_holes')
            .select(`course_id, ${COURSE_HOLES_SELECT}`)
            .in('course_id', ids)
            .order('course_id')
            .order('hole_number')
            .range(from, to)
            .returns<CourseHoleWithCourse[]>(),
        'season birdies course_holes',
      );
      for (const row of holeRows) {
        const byHole = courseHolesByCourse.get(row.course_id) ?? new Map<number, CourseHoleRow>();
        byHole.set(row.hole_number, row);
        courseHolesByCourse.set(row.course_id, byHole);
      }
    }

    return tallySeasonBirdies({ games, players, scores, courseHolesByCourse });
  },
  ['club-statistikk-birdies'],
  { tags: ['club-statistikk'], revalidate: 300 },
);
