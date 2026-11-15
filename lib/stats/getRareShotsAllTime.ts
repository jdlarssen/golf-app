import 'server-only';
import { unstable_cache } from 'next/cache';
import { getAdminClient } from '@/lib/supabase/admin';
import { selectAllRows } from '@/lib/supabase/selectAllRows';
import { chunks } from '@/lib/stats/chunks';
import { COURSE_HOLES_SELECT, type CourseHoleRow } from '@/lib/supabase/queryFragments';
import type { GameMode, ScoringGender } from '@/lib/scoring/modes/types';
import { isAereslisteKind } from '@/lib/stats/aeresliste';
import { playedOnKey, tallyRareMoments, type MomentGame, type RareMoment } from '@/lib/stats/rareMoments';
import { countsForBirdies, type BirdiePlayer, type BirdieScore } from '@/lib/stats/seasonBirdies';

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
  users: { is_guest: boolean; deleted_at: string | null; name: string | null; nickname: string | null } | null;
};

type CourseHoleWithCourse = CourseHoleRow & { course_id: string };

/**
 * A hole-in-one or albatross is at most 3 strokes: par is 3–6 (the CHECKs on
 * `course_holes`, 0001 and 0040), and an albatross is three under. Reading only those
 * score rows keeps an all-years read small; the tally still decides what each one is.
 */
export const RARE_SHOT_MAX_STROKES = 3;

/** Every hole-in-one and albatross, all years, with the names to show them by. */
export type RareShotsAllTime = {
  /** `userId` never leaves the server. */
  moments: RareMoment[];
  /** `[userId, name]` and `[userId, nickname]` for the players in `moments`. */
  names: Array<[string, string]>;
  nicknames: Array<[string, string]>;
};

/**
 * Æreslista (#2894 PR 2): one read of every finished game that counts (`countsForBirdies`,
 * the same rule as the «Sjeldne slag» card), tallied by `tallyRareMoments` and kept to
 * hole-in-one and albatross. No season window: the list is for all years (the owner's
 * answer 3).
 *
 * Service role, as `getSeasonStrokes`: a finished game is not world-readable (#1542), so
 * the caller (`/api/aeresliste`) is the port and sends only short names, hole, course and
 * date. The opt-outs (`share_rare_shots`) are NOT applied here; the route applies them
 * uncached, so a switch takes effect on the next read. Cached five minutes under the same
 * tag as the rest of the Toppliste.
 */
export const getRareShotsAllTime = unstable_cache(
  async (): Promise<RareShotsAllTime> => {
    const supabase = getAdminClient();

    const gameRows = await selectAllRows(
      (from, to) =>
        supabase
          .from('games')
          .select('id, game_mode, course_id, source_game_id, scheduled_tee_off_at, ended_at, courses(name)')
          .eq('status', 'finished')
          .order('id')
          .range(from, to)
          .returns<GameRow[]>(),
      'rare shots games',
    );
    const games: MomentGame[] = gameRows.map((g) => ({
      id: g.id,
      gameMode: g.game_mode,
      courseId: g.course_id,
      derived: g.source_game_id != null,
      courseName: g.courses?.name ?? null,
      playedOn: playedOnKey(g),
    }));
    const counted = games.filter(countsForBirdies);
    const gameIds = counted.map((g) => g.id);
    if (gameIds.length === 0) return { moments: [], names: [], nicknames: [] };

    const players: BirdiePlayer[] = [];
    const scores: BirdieScore[] = [];
    const names = new Map<string, string>();
    const nicknames = new Map<string, string>();
    for (const ids of chunks(gameIds)) {
      const lowScores = await selectAllRows(
        (from, to) =>
          supabase
            .from('scores')
            .select('game_id, user_id, hole_number, strokes')
            .in('game_id', ids)
            .lte('strokes', RARE_SHOT_MAX_STROKES)
            .order('id')
            .range(from, to)
            .returns<BirdieScore[]>(),
        'rare shots scores',
      );
      if (lowScores.length === 0) continue;
      scores.push(...lowScores);
      // Only the games with a low score need their players read.
      const withLow = Array.from(new Set(lowScores.map((s) => s.game_id)));
      const playerRows = await selectAllRows(
        (from, to) =>
          supabase
            .from('game_players')
            .select('game_id, user_id, tee_gender, withdrawn_at, users!game_players_user_id_fkey(is_guest, deleted_at, name, nickname)')
            .in('game_id', withLow)
            .order('game_id')
            .order('user_id')
            .range(from, to)
            .returns<PlayerRow[]>(),
        'rare shots game_players',
      );
      for (const p of playerRows) {
        players.push({
          gameId: p.game_id,
          userId: p.user_id,
          teeGender: p.tee_gender,
          withdrawn: p.withdrawn_at != null,
          // A deleted account is left out like a guest: `anonymize_user` renames it «Slettet
          // bruker» and drops its `notification_preferences` row, so an earlier «no» to
          // sharing is gone and the list would show «Slettet B.» for good.
          isGuest: (p.users?.is_guest ?? false) || p.users?.deleted_at != null,
        });
        if (p.users?.name && !names.has(p.user_id)) names.set(p.user_id, p.users.name);
        if (p.users?.nickname && !nicknames.has(p.user_id)) nicknames.set(p.user_id, p.users.nickname);
      }
    }
    if (scores.length === 0) return { moments: [], names: [], nicknames: [] };

    const lowGameIds = new Set(scores.map((s) => s.game_id));
    const courseIds = Array.from(
      new Set(
        counted
          .filter((g) => lowGameIds.has(g.id))
          .map((g) => g.courseId)
          .filter((c): c is string => c != null),
      ),
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
        'rare shots course_holes',
      );
      for (const row of holeRows) {
        const byHole = courseHolesByCourse.get(row.course_id) ?? new Map<number, CourseHoleRow>();
        byHole.set(row.hole_number, row);
        courseHolesByCourse.set(row.course_id, byHole);
      }
    }

    const moments = tallyRareMoments({ games, players, scores, courseHolesByCourse }).filter((m) =>
      isAereslisteKind(m.kind),
    );
    const inMoments = new Set(moments.map((m) => m.userId));
    return {
      moments,
      names: Array.from(names).filter(([id]) => inMoments.has(id)),
      nicknames: Array.from(nicknames).filter(([id]) => inMoments.has(id)),
    };
  },
  ['aeresliste-rare-shots'],
  { tags: ['club-statistikk'], revalidate: 300 },
);
