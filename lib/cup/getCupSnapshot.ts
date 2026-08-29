import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { COURSE_HOLES_SELECT, SCORES_SELECT } from '@/lib/supabase/queryFragments';
import type { CupPerformanceGame } from './computeCupAwards';
import { computeSubmissionStatusByGame } from './matchSubmissionStatus';
import { buildCupRoster, type CupRoster, type CupRosterPlayer } from './cupRoster';
import {
  buildCupMatchEntry,
  type CupMatchGameRow,
  type CupMatchPlayerRow,
  type CupMatchScoreRow,
} from './cupMatchEntry';
import {
  buildCupSideAwards,
  type CupSideAwardRow,
  type CupSideAwardSnapshot,
} from './cupSideAwardSnapshot';
import {
  computeCupLeaderboard,
  type CupLeaderboardResult,
  type CupMatchInput,
  type TournamentInput,
} from './computeCupLeaderboard';

/**
 * Server-side snapshot-loader for en cup. Fetcher tournament + alle matches +
 * scores + course/tee, kjører singles matchplay-scoring per match, og
 * aggregerer til master-leaderboard via `computeCupLeaderboard`.
 *
 * Bevisst ikke `unstable_cache`-wrappet i fase 1: cup-sidene er sjeldne
 * lese-stier (admin + offentlig leaderboard) og caching ville fan-out på
 * hver match-finish (kompleks invalidering). Vi måler først om det trengs.
 *
 * Bruker admin-client (service-role) for å bypass RLS, slik at fetcher-en
 * fungerer fra public `/cup/[id]`-server-component. Authz på tournament:
 * RLS-policy gjør den lesbar for alle authenticated allikevel — admin-client
 * er kun for å unngå dobbel-trip-roundtrip når vi senere flytter til
 * unstable_cache.
 *
 * Selve utledningen bor i rene nabomoduler (#1522) — denne filen gjør IO,
 * gruppering og sammenstilling:
 *  - `cupRoster` — lag-rosteret + side-labels
 *  - `cupMatchEntry` → `cupMatchDisplayResult` + `cupMatchGameMode` — én kamps
 *    leaderboard-input og prestasjons-input
 *  - `cupSideAwardSnapshot` — sidepoeng-utfoldingen
 *  - `matchSubmissionStatus` — «Scorekort levert» per kamp (#1488)
 */

export type { CupRoster, CupRosterPlayer, CupSideAwardSnapshot };

export type CupSnapshot = {
  tournament: {
    id: string;
    name: string;
    team_1_name: string;
    team_2_name: string;
    // NULL fram til cupen starter (#1142).
    points_to_win: number | null;
    status: 'draft' | 'active' | 'finished';
    winner_team: 1 | 2 | null;
    created_by: string;
    created_at: string;
    started_at: string | null;
    finished_at: string | null;
    group_id: string | null;
    // Vektbare cup-poeng (#1441, D8) — default 1/0,5 ved DB-nivå, alltid
    // konkrete tall her (aldri null/undefined).
    win_points: number;
    tie_points: number;
  };
  leaderboard: CupLeaderboardResult;
  roster: CupRoster;
  /** Cupens sidepoeng-oppsett (#1441, D9) — tom liste for cuper uten. */
  sideAwards: CupSideAwardSnapshot[];
  /**
   * Råstoff for «dro ned mest»-kåringen (#1508): ett innslag per spill der
   * hver spiller fører sin EGEN ball. Bygget i den eksisterende game-loopen —
   * ingen ekstra DB-lesinger. Tom liste for cuper uten slike spill (f.eks. en
   * ren greensome-cup), og da vises kåringen ikke.
   */
  performanceInputs: CupPerformanceGame[];
};

type GameRow = CupMatchGameRow & {
  name: string;
  course_id: string | null;
  tee_box_id: string | null;
  created_at: string;
};

type PlayerRow = CupMatchPlayerRow & {
  game_id: string;
  // #1502: leverings-tilstand per spiller — driver «Scorekort levert»-labelen
  // (alle ikke-trukne levert) og leverings-gaten i finishTournament.
  submitted_at: string | null;
  withdrawn_at: string | null;
};

type ScoreRow = CupMatchScoreRow & { game_id: string };

type CourseHoleRow = {
  course_id: string;
  hole_number: number;
  par_mens: number;
  par_ladies: number;
  par_juniors: number;
  stroke_index: number;
};

type SnapshotHole = { number: number; par: number; strokeIndex: number };

/** Grupperer rader per `game_id`, i radenes egen rekkefølge. */
function groupByGameId<T extends { game_id: string }>(rows: readonly T[]): Map<string, T[]> {
  const byGame = new Map<string, T[]>();
  for (const row of rows) {
    const arr = byGame.get(row.game_id) ?? [];
    arr.push(row);
    byGame.set(row.game_id, arr);
  }
  return byGame;
}

/**
 * `par` ble droppet i migrasjon 0040 til fordel for per-kjønn-kolonner. Map til
 * `par` via par_mens (samme som buildModeResultForGame).
 */
function groupHolesByCourse(rows: readonly CourseHoleRow[]): Map<string, SnapshotHole[]> {
  const byCourse = new Map<string, SnapshotHole[]>();
  for (const row of rows) {
    const arr = byCourse.get(row.course_id) ?? [];
    arr.push({ number: row.hole_number, par: row.par_mens, strokeIndex: row.stroke_index });
    byCourse.set(row.course_id, arr);
  }
  return byCourse;
}

/** Banens hull for ett spill — tom liste for et spill uten bane. */
function holesForCourse(
  byCourse: Map<string, SnapshotHole[]>,
  courseId: string | null,
): SnapshotHole[] {
  return (courseId && byCourse.get(courseId)) || [];
}

/**
 * `unknownLabel` er påkrevd (#1527): snapshot-en bygger visnings-navn, og
 * fallbacken for en spiller uten navn må komme oversatt fra kallstedet — denne
 * modulen kjenner ingen locale.
 */
export async function getCupSnapshot(
  tournamentId: string,
  unknownLabel: string,
): Promise<CupSnapshot | null> {
  const supabase = getAdminClient();

  const { data: tournament, error: tErr } = await supabase
    .from('tournaments')
    .select(
      'id, name, team_1_name, team_2_name, points_to_win, status, winner_team, created_by, created_at, started_at, finished_at, group_id, win_points, tie_points',
    )
    .eq('id', tournamentId)
    .maybeSingle();

  if (tErr) throw tErr;
  if (!tournament) return null;

  // Cast: status/winner_team is text/smallint at DB layer but constrained by CHECK
  const t = tournament as CupSnapshot['tournament'];

  const { data: gameRows, error: gErr } = await supabase
    .from('games')
    .select(
      'id, name, status, game_mode, mode_config, tournament_match_label, course_id, tee_box_id, created_at, hole_segment, source_game_id, score_visibility',
    )
    .eq('tournament_id', tournamentId)
    .order('created_at', { ascending: true });
  if (gErr) throw gErr;

  const games = (gameRows ?? []) as GameRow[];
  const gameIds = games.map((g) => g.id);

  // #1441 (D9): sidepoeng-konfigurasjonen er tournament-scoped (ingen
  // games-avhengighet) — egen sekventiell fetch, ikke bundlet i Promise.all-
  // gruppen under (den er game-avhengig: venter på `gameIds`).
  // Deterministisk sortering (#1489): slot-radene må komme i fast rekkefølge
  // for «1 av 3»-nummereringen i panelet.
  const { data: sideAwardRows, error: saErr } = await supabase
    .from('tournament_side_awards')
    .select(
      'id, kind, hole_number, points, winner_user_id, no_winner, slot, gir_max_per_team, gir_team1_count, gir_team2_count',
    )
    .eq('tournament_id', tournamentId)
    .order('kind')
    .order('hole_number')
    .order('slot');
  if (saErr) throw saErr;

  const [playersRes, scoresRes, holesByCourseRes] = await Promise.all([
    gameIds.length === 0
      ? Promise.resolve({ data: [] as PlayerRow[], error: null })
      : supabase
          .from('game_players')
          .select(
            'game_id, user_id, team_number, course_handicap, submitted_at, withdrawn_at, users!game_players_user_id_fkey(name, nickname)',
          )
          .in('game_id', gameIds),
    gameIds.length === 0
      ? Promise.resolve({ data: [] as ScoreRow[], error: null })
      : supabase
          .from('scores')
          .select(`game_id, ${SCORES_SELECT}`)
          .in('game_id', gameIds),
    games.length === 0
      ? Promise.resolve({ data: [] as CourseHoleRow[], error: null })
      : supabase
          .from('course_holes')
          .select(`course_id, ${COURSE_HOLES_SELECT}`)
          .in(
            'course_id',
            Array.from(new Set(games.map((g) => g.course_id).filter((id): id is string => Boolean(id)))),
          ),
  ]);
  if (playersRes.error) throw playersRes.error;
  if (scoresRes.error) throw scoresRes.error;
  if (holesByCourseRes.error) throw holesByCourseRes.error;

  const holesByCourse = groupHolesByCourse((holesByCourseRes.data ?? []) as CourseHoleRow[]);
  const playersByGame = groupByGameId((playersRes.data ?? []) as PlayerRow[]);
  const scoresByGame = groupByGameId((scoresRes.data ?? []) as ScoreRow[]);

  // #1488 (K4): «Scorekort levert» derived per game in a pre-pass so a DERIVED
  // match (which owns no submissions of its own) inherits its host's status
  // instead of showing «Pågår» forever (#1502 owner finding).
  const submissionStatusByGame = computeSubmissionStatusByGame(
    games.map((g) => ({
      gameId: g.id,
      sourceGameId: g.source_game_id,
      players: playersByGame.get(g.id) ?? [],
    })),
  );

  // Roster: distinct players grouped by team_number across all matches, i
  // kamp-rekkefølge (created_at asc) — sidepoeng-mappingen under slår opp i det.
  const roster = buildCupRoster(games.map((g) => playersByGame.get(g.id) ?? []));

  const matchInputs: CupMatchInput[] = [];
  const performanceInputs: CupPerformanceGame[] = [];

  for (const game of games) {
    // #1441 (D3): en avledet match (singles på back9) eier ALDRI egne scores
    // — alle lese-stier henter fra `source_game_id ?? id`. Host og avledet
    // deler ALLTID samme `tournament_id` (bunten genereres samlet under én
    // cup, #1441 D4), så host-en er alltid blant `games`/`gameIds` over —
    // ingen defensiv fetch-by-id-union utenfor `scoresByGame` trengs.
    const sourceId = game.source_game_id ?? game.id;
    const { match, performance } = buildCupMatchEntry({
      game,
      players: playersByGame.get(game.id) ?? [],
      scores: scoresByGame.get(sourceId) ?? [],
      courseHoles: holesForCourse(holesByCourse, game.course_id),
      // #1502/#1488 (K4/K5): «Scorekort levert» + helt-trukket-flagget. Avledede
      // kamper arver host-statusen; se pre-passet over.
      submission: submissionStatusByGame.get(game.id)!,
      unknownLabel,
    });
    matchInputs.push(match);
    if (performance) performanceInputs.push(performance);
  }

  const { sideAwards, leaderboardInputs } = buildCupSideAwards(
    (sideAwardRows ?? []) as CupSideAwardRow[],
    {
      team1UserIds: new Set(roster.team1.map((p) => p.userId)),
      team2UserIds: new Set(roster.team2.map((p) => p.userId)),
    },
  );

  const tournamentInput: TournamentInput = {
    team_1_name: t.team_1_name,
    team_2_name: t.team_2_name,
    points_to_win: t.points_to_win,
    status: t.status,
    winner_team: t.winner_team,
    win_points: t.win_points,
    tie_points: t.tie_points,
  };

  const leaderboard = computeCupLeaderboard(tournamentInput, matchInputs, leaderboardInputs);

  return {
    tournament: t,
    leaderboard,
    sideAwards,
    performanceInputs,
    roster,
  };
}
