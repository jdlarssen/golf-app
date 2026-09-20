import 'server-only';

/**
 * Innlasteren for Kavalkaden (#2127, epic #1040) — all databasekontakt på ett sted.
 *
 * Henter årets ferdige runder for én spiller og kretsen rundt hen, og leverer dem
 * i formen `buildKavalkadeFacts` vil ha. All aggregering skjer der; her er det bare
 * spørringer og omforming.
 *
 * ## Hva som hentes, og hvorfor akkurat det
 *
 * Startpunktet er alltid spillerens egne rader i `game_players`. Kretsen utledes av
 * medspillerne i NETTOPP de rundene — vi henter aldri en runde spilleren ikke var
 * med i. Et ferdig spill er ikke world-read (#1542), og Kavalkaden skal ikke bli en
 * bakvei inn i tall spilleren ellers ikke ser.
 *
 * Avledede spill (`games.source_game_id IS NOT NULL`) utelates, samme regel som
 * historikk (#1441): en avledet back9-match har ingen egne scorer og ville telt
 * samme dag to ganger.
 *
 * ## Hvorfor service-rolle-klienten
 *
 * Medspillernes scorer og `result_summary` trengs for gjengens kort, og RLS gir
 * ikke nødvendigvis spilleren lesetilgang til alle sammen. Gaten ligger derfor i
 * kallstedet: lasteren tar `viewerUserId` som allerede er verifisert
 * (`getProxyVerifiedUserId`), og leser bare runder den spilleren selv gikk.
 * Samme mønster som `lib/stats`-tavla i `/profile/statistikk`.
 */
import { getAdminClient } from '@/lib/supabase/admin';
import {
  COURSE_HOLES_SELECT,
  type CourseHoleRow,
} from '@/lib/supabase/queryFragments';
import { selectAllRows } from '@/lib/supabase/selectAllRows';
import type { ResultSummary } from '@/lib/scoring/resultSummary';
import type { ScoringGender } from '@/lib/scoring/modes/types';
import { parForGender, type HoleScore } from '@/lib/stats/achievements';
import { effectiveDate, effectiveYear } from '@/lib/stats/effectiveDate';
import type {
  KavalkadeGame,
  KavalkadeInput,
  KavalkadePlayerRound,
} from './buildKavalkadeFacts';
import { KAVALKADE_CUTOFF, KAVALKADE_YEAR } from './release';

/**
 * Hvor langt før nyttår spørringen starter.
 *
 * Runden dateres av planlagt utslag, men filtreres i SQL på `ended_at` — de to kan
 * ligge på hver sin side av nyttår. En uke slingringsmonn henter runden uansett, og
 * `effectiveYear` avgjør så hvilket år den faktisk hører til.
 */
const YEAR_START_SLACK_DAYS = 7;

type GameRow = {
  id: string;
  name: string;
  scheduled_tee_off_at: string | null;
  ended_at: string | null;
  course_id: string | null;
  courses: { name: string } | null;
};

type GamePlayerRow = {
  game_id: string;
  user_id: string;
  withdrawn_at: string | null;
  course_handicap: number | null;
  result_summary: ResultSummary | null;
  tee_gender: ScoringGender | null;
  users: { name: string | null } | null;
};

type ScoreRow = {
  game_id: string;
  user_id: string;
  hole_number: number;
  strokes: number | null;
};

type CourseHoleWithCourse = CourseHoleRow & { course_id: string };

export type LoadKavalkadeInputOptions = {
  /** Året som fortelles om. Default `KAVALKADE_YEAR`. */
  year?: number;
  /** Frysegrensen. Default `KAVALKADE_CUTOFF`. */
  cutoff?: Date;
};

/**
 * Leser årets ferdige runder for `viewerUserId` og bygger `KavalkadeInput`.
 *
 * Returnerer alltid et gyldig input — en spiller uten runder gir bare en tom
 * `games`-liste, og fakta-byggeren svarer med tomme kort.
 */
export async function loadKavalkadeInput(
  viewerUserId: string,
  options: LoadKavalkadeInputOptions = {},
): Promise<KavalkadeInput> {
  const year = options.year ?? KAVALKADE_YEAR;
  const cutoff = options.cutoff ?? KAVALKADE_CUTOFF;
  const supabase = getAdminClient();

  const empty: KavalkadeInput = { viewerUserId, year, cutoff, games: [] };

  // Runde 1: spillerens egne ferdige, ikke-avledede runder i vinduet rundt året.
  // `ended_at` er både frysegrensen og det eneste feltet som garantert er satt på
  // et ferdig spill, så SQL-filteret går på den; `effectiveYear` finjusterer under.
  const { data: mineRaw, error: mineError } = await supabase
    .from('game_players')
    .select(
      'game_id, games!inner(id, name, scheduled_tee_off_at, ended_at, course_id, courses(name))',
    )
    .eq('user_id', viewerUserId)
    .is('withdrawn_at', null)
    .eq('games.status', 'finished')
    .is('games.source_game_id', null)
    .gte('games.ended_at', windowStart(year).toISOString())
    .lt('games.ended_at', cutoff.toISOString());
  if (mineError) throw mineError;

  const myGames = (mineRaw ?? [])
    .map((row) => (row as unknown as { games: GameRow | null }).games)
    .filter((g): g is GameRow => g != null)
    .filter((g) => effectiveYear(g) === year);

  if (myGames.length === 0) return empty;

  const gameIds = myGames.map((g) => g.id);
  const courseIds = [
    ...new Set(myGames.map((g) => g.course_id).filter((id): id is string => id != null)),
  ];

  // Runde 2–4: medspillerne, alles scorer og banens kjønns-par. Uavhengige.
  const [playerRows, scoreRows, holeRows] = await Promise.all([
    selectAllRows(
      (from, to) =>
        supabase
          .from('game_players')
          .select(
            'game_id, user_id, withdrawn_at, course_handicap, result_summary, tee_gender, users!game_players_user_id_fkey(name)',
          )
          .in('game_id', gameIds)
          // Paging må ordne på noe unikt — nøkkelen her er (game_id, user_id).
          .order('game_id')
          .order('user_id')
          .range(from, to)
          .returns<GamePlayerRow[]>(),
      'kavalkade game_players',
    ),
    selectAllRows(
      (from, to) =>
        supabase
          .from('scores')
          .select('game_id, user_id, hole_number, strokes')
          .in('game_id', gameIds)
          .not('strokes', 'is', null)
          .order('id')
          .range(from, to)
          .returns<ScoreRow[]>(),
      'kavalkade scores',
    ),
    courseIds.length > 0
      ? selectAllRows(
          (from, to) =>
            supabase
              .from('course_holes')
              .select(`course_id, ${COURSE_HOLES_SELECT}`)
              .in('course_id', courseIds)
              .order('course_id')
              .order('hole_number')
              .range(from, to)
              .returns<CourseHoleWithCourse[]>(),
          'kavalkade course_holes',
        )
      : Promise.resolve([]),
  ]);

  const holesByCourse = new Map<string, Map<number, CourseHoleRow>>();
  for (const hole of holeRows) {
    let byNumber = holesByCourse.get(hole.course_id);
    if (!byNumber) {
      byNumber = new Map();
      holesByCourse.set(hole.course_id, byNumber);
    }
    byNumber.set(hole.hole_number, hole);
  }

  const playersByGame = new Map<string, GamePlayerRow[]>();
  for (const row of playerRows) {
    const list = playersByGame.get(row.game_id);
    if (list) list.push(row);
    else playersByGame.set(row.game_id, [row]);
  }

  const scoresByGameAndPlayer = new Map<string, ScoreRow[]>();
  for (const row of scoreRows) {
    const key = `${row.game_id}:${row.user_id}`;
    const list = scoresByGameAndPlayer.get(key);
    if (list) list.push(row);
    else scoresByGameAndPlayer.set(key, [row]);
  }

  const games: KavalkadeGame[] = myGames.map((game) => {
    const courseHoles = game.course_id
      ? holesByCourse.get(game.course_id)
      : undefined;

    const players: KavalkadePlayerRound[] = (
      playersByGame.get(game.id) ?? []
    ).map((row) => ({
      userId: row.user_id,
      name: row.users?.name ?? null,
      withdrawnAt: row.withdrawn_at,
      resultSummary: row.result_summary,
      courseHandicap: row.course_handicap,
      holes: toHoleScores(
        scoresByGameAndPlayer.get(`${game.id}:${row.user_id}`) ?? [],
        courseHoles,
        row.tee_gender,
      ),
    }));

    return {
      gameId: game.id,
      gameName: game.name,
      courseName: game.courses?.name ?? null,
      year: effectiveYear(game),
      endedAt: game.ended_at ? new Date(game.ended_at) : null,
      playedAt: effectiveDate(game),
      players,
    };
  });

  return { viewerUserId, year, cutoff, games };
}

/** Én uke før Oslo-nyttår, som absolutt instant. */
function windowStart(year: number): Date {
  // 1. januar kl. 00:00 i Oslo er 31. desember kl. 23:00 UTC året før (vintertid).
  const osloNewYear = new Date(Date.UTC(year - 1, 11, 31, 23, 0, 0));
  return new Date(
    osloNewYear.getTime() - YEAR_START_SLACK_DAYS * 24 * 60 * 60 * 1000,
  );
}

/**
 * Score-rader → hull med kjønns-valgt par. Hull uten bane-rad får `par: 0`, som
 * `countRoundAchievements` og nemesis-regningen allerede hopper over — et manglende
 * par skal aldri bli en birdie.
 */
function toHoleScores(
  scores: ScoreRow[],
  courseHoles: Map<number, CourseHoleRow> | undefined,
  gender: ScoringGender | null,
): HoleScore[] {
  return scores.map((score) => {
    const hole = courseHoles?.get(score.hole_number);
    return {
      holeNumber: score.hole_number,
      strokes: score.strokes,
      par: hole ? parForGender(hole, gender) : 0,
    };
  });
}
