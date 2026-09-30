// #2256: spørringen bak runde-lista (`lib/roundHistory.ts`).
//
// Filtrene er webbens (`app/[locale]/profile/historikk/page.tsx`): egne
// `game_players`-rader i ferdige spill, uten avledede spill (#1441 — et avledet
// spill har ingen egne slag, og runden står alt under verten), og så egne slag
// som ikke er null. Anon-klienten leser selv: egne rader er synlige gjennom
// RLS, og banene og tee-ene er åpne for alle (`0002_rls_policies.sql`), så
// ingen serverrute trengs.
//
// Slagene hentes sidevis (#1894): en aktiv spiller kan fort ha mer enn 1 000
// slag på et år, og PostgREST kutter svaret uten å si fra. Hullene på banene
// hentes sidevis av samme grunn: 18 rader per bane blir fort over 1 000.
//
// #2265 (Rundedagboka) leser alle år, og i tillegg spillnavn, bane, format,
// lengde, handicap, putter og differensial, pluss banene og tee-ene (par per
// hull og slope/CR) side om side med slagene. Bag-taggen leser samme liste for
// ett år.
//
// Ingen cache: uten nett står skjermens feillinje.
import type { TeeBoxRatings } from '../../../../lib/games/teeRating';
import type { HoleSegment } from '../../../../lib/scoring/holeSegment';
import type { ResultSummary } from '../../../../lib/scoring/resultSummary';
import type { GameMode, ScoringGender } from '../../../../lib/scoring/modes/types';
import {
  COURSE_HOLES_SELECT,
  type CourseHoleRow,
} from '../../../../lib/supabase/queryFragments';
import { selectAllRows } from '../../../../lib/supabase/selectAllRows';
import {
  buildHistoryRounds,
  localRoundYear,
  type HistoryCourseData,
  type HistoryGameInput,
  type HistoryRound,
} from '../lib/roundHistory';
import { supabase } from '../supabase';

interface HistoryRow {
  game_id: string;
  tee_gender: ScoringGender | null;
  course_handicap: number | null;
  result_summary: ResultSummary | null;
  score_differential: number | null;
  games: {
    id: string;
    name: string;
    scheduled_tee_off_at: string | null;
    ended_at: string | null;
    game_mode: string;
    hole_segment: string;
    course_id: string | null;
    tee_box_id: string | null;
    courses: { name: string } | null;
  };
}

const HISTORY_SELECT =
  'game_id, tee_gender, course_handicap, result_summary, score_differential, games!inner(id, name, scheduled_tee_off_at, ended_at, game_mode, hole_segment, course_id, tee_box_id, courses(name))';

/** Webbens utvalg av tee-ratinger (slope, CR og par per kjønn). */
const TEE_SELECT =
  'id, slope_mens, course_rating_mens, par_total_mens, slope_ladies, course_rating_ladies, par_total_ladies, slope_juniors, course_rating_juniors, par_total_juniors';

export interface RoundHistoryOptions {
  /**
   * Bare runder fra dette året (enhetens lokaltid), og slag bare for dem.
   * Utelatt = alle år. Bag-taggen trenger ett år, og slipper da å laste
   * slagene for alle rundene spilleren noen gang har spilt.
   */
  year?: number;
}

function distinct(values: readonly (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => v != null))];
}

/** Hullene og tee-ene rundene ble spilt på. Tomme lister gir ingen spørring. */
async function fetchCourseData(games: readonly HistoryGameInput[]): Promise<HistoryCourseData> {
  const courseIds = distinct(games.map((game) => game.courseId));
  const teeIds = distinct(games.map((game) => game.teeBoxId));
  const [holes, tees] = await Promise.all([
    courseIds.length === 0
      ? Promise.resolve([] as (CourseHoleRow & { course_id: string })[])
      : selectAllRows(
          (from, to) =>
            supabase
              .from('course_holes')
              .select(`course_id, ${COURSE_HOLES_SELECT}`)
              .in('course_id', courseIds)
              .order('course_id')
              .order('hole_number')
              .range(from, to)
              .returns<(CourseHoleRow & { course_id: string })[]>(),
          'fetchRoundHistory course_holes',
        ),
    teeIds.length === 0
      ? Promise.resolve([] as (TeeBoxRatings & { id: string })[])
      : supabase
          .from('tee_boxes')
          .select(TEE_SELECT)
          .in('id', teeIds)
          .returns<(TeeBoxRatings & { id: string })[]>()
          .then(({ data, error }) => {
            if (error) throw new Error(error.message);
            return data ?? [];
          }),
  ]);

  const holesByCourse = new Map<string, Map<number, CourseHoleRow>>();
  for (const { course_id: courseId, ...hole } of holes) {
    const perHole = holesByCourse.get(courseId) ?? new Map<number, CourseHoleRow>();
    perHole.set(hole.hole_number, hole);
    holesByCourse.set(courseId, perHole);
  }
  const teeById = new Map<string, TeeBoxRatings>(tees.map(({ id, ...ratings }) => [id, ratings]));
  return { holesByCourse, teeById };
}

/**
 * Spillerens ferdige runder, nyeste først. Kaster når en av spørringene
 * feiler — kalleren avgjør hva skjermen viser da.
 */
export async function fetchRoundHistory(
  userId: string,
  options: RoundHistoryOptions = {},
): Promise<HistoryRound[]> {
  const { data, error } = await supabase
    .from('game_players')
    .select(HISTORY_SELECT)
    .eq('user_id', userId)
    .eq('games.status', 'finished')
    .is('games.source_game_id', null)
    .returns<HistoryRow[]>();
  if (error) throw new Error(error.message);

  const games: HistoryGameInput[] = (data ?? []).map((row) => ({
    gameId: row.games.id,
    name: row.games.name,
    scheduledTeeOffAt: row.games.scheduled_tee_off_at,
    endedAt: row.games.ended_at,
    // Enumene i basen er `GameMode`- og `HoleSegment`-unionene; PostgREST gir
    // dem som strenger.
    gameMode: row.games.game_mode as GameMode,
    holeSegment: row.games.hole_segment as HoleSegment,
    courseId: row.games.course_id,
    courseName: row.games.courses?.name ?? null,
    teeBoxId: row.games.tee_box_id,
    teeGender: row.tee_gender,
    courseHandicap: row.course_handicap,
    scoreDifferential: row.score_differential,
    resultSummary: row.result_summary ?? null,
  }));
  const wanted =
    options.year == null ? games : games.filter((game) => localRoundYear(game) === options.year);
  if (wanted.length === 0) return [];

  const [scores, courses] = await Promise.all([
    selectAllRows(
      (from, to) =>
        supabase
          .from('scores')
          .select('game_id, hole_number, strokes, putts')
          .eq('user_id', userId)
          .in(
            'game_id',
            wanted.map((game) => game.gameId),
          )
          .not('strokes', 'is', null)
          .order('id')
          .range(from, to)
          .returns<
            { game_id: string; hole_number: number; strokes: number | null; putts: number | null }[]
          >(),
      'fetchRoundHistory',
    ),
    fetchCourseData(wanted),
  ]);

  return buildHistoryRounds(
    wanted,
    scores
      .filter((row): row is typeof row & { strokes: number } => row.strokes != null)
      .map((row) => ({
        gameId: row.game_id,
        holeNumber: row.hole_number,
        strokes: row.strokes,
        putts: row.putts,
      })),
    courses,
  );
}
