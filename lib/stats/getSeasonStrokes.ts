import 'server-only';
import { unstable_cache } from 'next/cache';
import { getAdminClient } from '@/lib/supabase/admin';
import { selectAllRows } from '@/lib/supabase/selectAllRows';
import { chunks } from '@/lib/stats/chunks';
import { osloYearWindow } from '@/lib/format/osloCalendar';
import { COURSE_HOLES_SELECT, type CourseHoleRow } from '@/lib/supabase/queryFragments';
import type { GameMode, ScoringGender } from '@/lib/scoring/modes/types';
import { playedOnKey, tallyRareMoments, type MomentGame, type RareMoment } from '@/lib/stats/rareMoments';
import {
  countsForBirdies,
  tallySeasonBirdies,
  type BirdiePlayer,
  type BirdieScore,
} from '@/lib/stats/seasonBirdies';

type GameRow = {
  id: string;
  game_mode: GameMode;
  course_id: string | null;
  source_game_id: string | null;
  scheduled_tee_off_at: string | null;
  ended_at: string | null;
  courses: { name: string } | null;
};

type PlayerRow = {
  game_id: string;
  user_id: string;
  tee_gender: ScoringGender | null;
  withdrawn_at: string | null;
  users: { is_guest: boolean } | null;
};

type CourseHoleWithCourse = CourseHoleRow & { course_id: string };

/** Det Topplista leser ut av sesongens slag: birdie-tellingen og de sjeldne slagene. */
export type SeasonStrokes = {
  /** `[userId, birdies]` for hver spiller med minst én birdie. */
  birdies: Array<[string, number]>;
  /** Hver hole-in-one, albatross og eagle (`userId` forlater aldri serveren). */
  moments: RareMoment[];
};

/**
 * Sesongens slag (#2259): én lesing av de ferdige spillene som endte i `seasonYear`
 * (Oslo-kalenderåret, samme vindu som `getFinishedGameWins`, så fanene og kortet er
 * enige om «sesongen»), regnet to ganger: `tallySeasonBirdies` og `tallyRareMoments`.
 * De deler lesingen fordi score-radene er det tyngste; feiler den, feiler begge, og
 * ruta lar fanen og kortet si fra hver for seg.
 *
 * Service-rolle-lesing, som `getFinishedGameWins`: et ferdig spill er ikke world-readable
 * (#1542), så kalleren (`/api/aeresbrett`) er porten og sender bare tall, korte navn,
 * hull, bane og dato. Cachet fem minutter under samme tag som seirstellingen.
 */
export const getSeasonStrokes = unstable_cache(
  async (opts: { seasonYear: number }): Promise<SeasonStrokes> => {
    const supabase = getAdminClient();
    const season = osloYearWindow(new Date(Date.UTC(opts.seasonYear, 6, 1)));

    const gameRows = await selectAllRows(
      (from, to) =>
        supabase
          .from('games')
          .select('id, game_mode, course_id, source_game_id, scheduled_tee_off_at, ended_at, courses(name)')
          .eq('status', 'finished')
          .gte('ended_at', season.startIso)
          .lt('ended_at', season.endIso)
          .order('id')
          .range(from, to)
          .returns<GameRow[]>(),
      'season strokes games',
    );
    const games: MomentGame[] = gameRows.map((g) => ({
      id: g.id,
      gameMode: g.game_mode,
      courseId: g.course_id,
      derived: g.source_game_id != null,
      courseName: g.courses?.name ?? null,
      playedOn: playedOnKey(g),
    }));
    // Games that cannot count are not read further; saves score rows nobody uses.
    const counted = games.filter(countsForBirdies);
    const gameIds = counted.map((g) => g.id);
    if (gameIds.length === 0) return { birdies: [], moments: [] };

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
        'season strokes game_players',
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
          'season strokes scores',
        )),
      );
    }

    const courseIds = Array.from(
      new Set(counted.map((g) => g.courseId).filter((c): c is string => c != null)),
    );
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
        'season strokes course_holes',
      );
      for (const row of holeRows) {
        const byHole = courseHolesByCourse.get(row.course_id) ?? new Map<number, CourseHoleRow>();
        byHole.set(row.hole_number, row);
        courseHolesByCourse.set(row.course_id, byHole);
      }
    }

    return {
      birdies: tallySeasonBirdies({ games, players, scores, courseHolesByCourse }),
      moments: tallyRareMoments({ games, players, scores, courseHolesByCourse }),
    };
  },
  ['club-statistikk-strokes'],
  { tags: ['club-statistikk'], revalidate: 300 },
);
