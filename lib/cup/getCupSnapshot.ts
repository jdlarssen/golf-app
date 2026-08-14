import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { COURSE_HOLES_SELECT, SCORES_SELECT } from '@/lib/supabase/queryFragments';
import { computeCupMatchResult } from './computeCupMatchResult';
import { computeCupBestBallAward } from './computeCupBestBallAward';
import { PERSONALLY_SCORED_CUP_GAME_MODES, type CupPerformanceGame } from './computeCupAwards';
import { computeSubmissionStatusByGame } from './matchSubmissionStatus';
import { holesForSegment, type HoleSegment } from '@/lib/scoring/holeSegment';
import type { GameStatus } from '@/lib/games/status';
import {
  computeCupLeaderboard,
  type CupLeaderboardResult,
  type CupMatchInput,
  type CupSideAwardInput,
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
 */

export type CupRoster = {
  team1: CupRosterPlayer[];
  team2: CupRosterPlayer[];
};

export type CupRosterPlayer = {
  userId: string;
  name: string | null;
  nickname: string | null;
};

/**
 * Ett sidepoeng-innslag (#1441 D9, #1489 slots + GIR) klart for visning.
 *
 * ctp/ld: én snapshot-rad PER VINNER-PLASS (slot-rad i DB). `slotCount` er
 * antall søsken-rader med samme (kind, hull, points) — panelet bruker den til
 * «1 av 3»-nummerering og viser ingen nummerering når den er 1 (gamle cuper).
 * `winnerTeam` er allerede utledet fra `winner_user_id` via rosteret (samme
 * mapping som mates inn i `computeCupLeaderboard`) — konsumenter slipper å
 * gjøre oppslaget selv. `null` inntil arrangøren taster vinneren.
 *
 * `noWinner` (#1530) skiller «arrangøren har svart: ingen vant» fra «ikke
 * tastet ennå» — begge har `winnerUserId`/`winnerTeam` null og gir 0 poeng,
 * men bare den første teller som registrert (`isSideAwardRegistered`).
 *
 * gir: én rad per hull med maks per lag og de to lag-tellerne — `null` teller
 * = ikke registrert ennå, `0` = eksplisitt registrert null GIR (begge gir 0
 * poeng; skillet er kun semantisk i panelet). Ingen spiller-attribusjon.
 */
export type CupSideAwardSnapshot =
  | {
      id: string;
      kind: 'ctp' | 'ld';
      holeNumber: number;
      points: number;
      slot: number;
      slotCount: number;
      winnerUserId: string | null;
      winnerTeam: 1 | 2 | null;
      noWinner: boolean;
    }
  | {
      id: string;
      kind: 'gir';
      holeNumber: number;
      points: number;
      maxPerTeam: number;
      team1Count: number | null;
      team2Count: number | null;
    };

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

type GameRow = {
  id: string;
  name: string;
  status: GameStatus;
  game_mode: string;
  mode_config: unknown;
  tournament_match_label: string | null;
  // #1441 (D1/D3/D12): segment/avledet-kilde/blind-flagg for splittet cup-dag.
  // `hole_segment` er `NOT NULL DEFAULT 'full'` i DB — alltid en streng her,
  // men lest defensivt (`?? 'full'`) ved bruk under, samme mønster som
  // `mode_config` over.
  hole_segment: string;
  source_game_id: string | null;
  score_visibility: string;
};

type SideAwardRow = {
  id: string;
  kind: string;
  hole_number: number;
  points: number;
  winner_user_id: string | null;
  no_winner: boolean;
  slot: number;
  gir_max_per_team: number | null;
  gir_team1_count: number | null;
  gir_team2_count: number | null;
};

type UserRel = { name: string | null; nickname: string | null };
type PlayerRow = {
  game_id: string;
  user_id: string;
  team_number: number | null;
  course_handicap: number | null;
  // #1502: leverings-tilstand per spiller — driver «Scorekort levert»-labelen
  // (alle ikke-trukne levert) og leverings-gaten i finishTournament.
  submitted_at: string | null;
  withdrawn_at: string | null;
  // Supabase JS typer FK-joins som array selv på many-to-one. Normaliser
  // i call-site (se `userOf`).
  users: UserRel | UserRel[] | null;
};

function userOf(rel: UserRel | UserRel[] | null | undefined): UserRel | null {
  if (!rel) return null;
  if (Array.isArray(rel)) return rel[0] ?? null;
  return rel;
}

type ScoreRow = {
  game_id: string;
  user_id: string;
  hole_number: number;
  strokes: number | null;
};

function preferredName(
  p: { name: string | null; nickname: string | null } | null,
  unknownLabel: string,
): string {
  if (!p) return unknownLabel;
  return p.nickname?.trim() || p.name?.trim() || unknownLabel;
}

/**
 * Bygger en visnings-label for en sides spillere. Singles (1 spiller) → ett
 * navn. Fourball (2 spillere) → «Navn1/Navn2», sortert deterministisk via
 * eksisterende `user_id`-rekkefølge fra Supabase-queriet. Tom side →
 * `unknownLabel` som defensiv fallback. #217.
 */
function formatSideLabel(sidePlayers: PlayerRow[], unknownLabel: string): string {
  if (sidePlayers.length === 0) return unknownLabel;
  if (sidePlayers.length === 1) return preferredName(userOf(sidePlayers[0].users), unknownLabel);
  return sidePlayers.map((p) => preferredName(userOf(p.users), unknownLabel)).join('/');
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

  const games = (gameRows ?? []) as Array<
    GameRow & { course_id: string | null; tee_box_id: string | null; created_at: string }
  >;
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
      ? Promise.resolve({
          data: [] as Array<{
            course_id: string;
            hole_number: number;
            par_mens: number;
            par_ladies: number;
            par_juniors: number;
            stroke_index: number;
          }>,
          error: null,
        })
      : supabase
          .from('course_holes')
          // `par` ble droppet i migrasjon 0040 til fordel for per-kjønn-kolonner.
          // Map til `par` nedstrøms via par_mens (samme som buildModeResultForGame).
          .select(`course_id, ${COURSE_HOLES_SELECT}`)
          .in(
            'course_id',
            Array.from(new Set(games.map((g) => g.course_id).filter((id): id is string => Boolean(id)))),
          ),
  ]);
  if (playersRes.error) throw playersRes.error;
  if (scoresRes.error) throw scoresRes.error;
  if (holesByCourseRes.error) throw holesByCourseRes.error;

  const players = (playersRes.data ?? []) as PlayerRow[];
  const scores = (scoresRes.data ?? []) as ScoreRow[];
  const holesByCourse = new Map<string, Array<{ number: number; par: number; strokeIndex: number }>>();
  for (const row of (holesByCourseRes.data ?? []) as Array<{
    course_id: string;
    hole_number: number;
    par_mens: number;
    par_ladies: number;
    par_juniors: number;
    stroke_index: number;
  }>) {
    const arr = holesByCourse.get(row.course_id) ?? [];
    arr.push({ number: row.hole_number, par: row.par_mens, strokeIndex: row.stroke_index });
    holesByCourse.set(row.course_id, arr);
  }

  const playersByGame = new Map<string, PlayerRow[]>();
  for (const p of players) {
    const arr = playersByGame.get(p.game_id) ?? [];
    arr.push(p);
    playersByGame.set(p.game_id, arr);
  }
  const scoresByGame = new Map<string, ScoreRow[]>();
  for (const s of scores) {
    const arr = scoresByGame.get(s.game_id) ?? [];
    arr.push(s);
    scoresByGame.set(s.game_id, arr);
  }

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

  const matchInputs: CupMatchInput[] = [];
  const performanceInputs: CupPerformanceGame[] = [];

  // Roster: distinct players grouped by team_number across all matches.
  const team1Map = new Map<string, CupRosterPlayer>();
  const team2Map = new Map<string, CupRosterPlayer>();

  for (const game of games) {
    const gPlayers = playersByGame.get(game.id) ?? [];

    // #1441 (D3): en avledet match (singles på back9) eier ALDRI egne scores
    // — alle lese-stier henter fra `source_game_id ?? id`. Host og avledet
    // deler ALLTID samme `tournament_id` (bunten genereres samlet under én
    // cup, #1441 D4), så host-en er alltid blant `games`/`gameIds` over —
    // ingen defensiv fetch-by-id-union utenfor `scoresByGame` trengs.
    const sourceId = game.source_game_id ?? game.id;
    const gScores = scoresByGame.get(sourceId) ?? [];
    // #1441 (D1/D2): hull-i-scope for matchen — 'full' (dagens oppførsel) med
    // mindre bunt-genereringen satte front9/back9.
    const segment = (game.hole_segment as HoleSegment | undefined) ?? 'full';
    const courseHoles = (game.course_id && holesByCourse.get(game.course_id)) || [];
    const holes = holesForSegment(courseHoles, segment);

    // Per side: alle spillere med team_number 1 eller 2. Singles har 1 per side,
    // lag-format (fourball/foursomes/greensome/chapman/gruesome/best_ball) har 2.
    const side1Players = gPlayers.filter((p) => p.team_number === 1);
    const side2Players = gPlayers.filter((p) => p.team_number === 2);

    // #1502/#1488 (K4/K5): «Scorekort levert» + helt-trukket-flagget. Avledede
    // kamper arver host-statusen; se pre-passet over.
    const { allScorecardsSubmitted, allPlayersWithdrawn } =
      submissionStatusByGame.get(game.id)!;

    // Collect roster: add players to their respective team-buckets.
    for (const p of gPlayers) {
      const u = userOf(p.users);
      const entry: CupRosterPlayer = {
        userId: p.user_id,
        name: u?.name ?? null,
        nickname: u?.nickname ?? null,
      };
      if (p.team_number === 1 && !team1Map.has(p.user_id)) team1Map.set(p.user_id, entry);
      if (p.team_number === 2 && !team2Map.has(p.user_id)) team2Map.set(p.user_id, entry);
    }

    // #1508: prestasjons-input for «dro ned mest»-kåringen. To filtre, begge
    // nødvendige:
    //   - Kun modi med personlig føring (PERSONALLY_SCORED_CUP_GAME_MODES) —
    //     foursomes-familien fører lagball og kan aldri attribuere individuell
    //     prestasjon.
    //   - Kun HOST-spill: en avledet match (#1441 D3) eier ingen egne scores,
    //     den leser host-ens. Uten dette filteret ville splittet cup-dag telt
    //     det samme scoresettet to ganger.
    // Ingen ekstra DB-lesing — alt er allerede hentet for match-scoringen.
    if (
      game.source_game_id == null &&
      (PERSONALLY_SCORED_CUP_GAME_MODES as readonly string[]).includes(game.game_mode)
    ) {
      performanceInputs.push({
        gameId: game.id,
        holes: holes.map((h) => ({ number: h.number, par: h.par, strokeIndex: h.strokeIndex })),
        players: gPlayers.map((p) => ({
          userId: p.user_id,
          courseHandicap: p.course_handicap ?? 0,
        })),
        scores: gScores.map((s) => ({
          userId: s.user_id,
          holeNumber: s.hole_number,
          strokes: s.strokes,
        })),
      });
    }

    // `mode_config` — `allowance_pct` for matchplay-familiens lag-format,
    // `team_strokes_override` KUN meningsfullt for greensome (D10).
    // Best-ball-hosten (D4/D11) har IKKE `allowance_pct` her (#1539/#1551):
    // dens allowance bor på `games.hcp_allowance_pct` og er alt anvendt i det
    // frosne banehandicapet, slik at kampens egen tavle og cup-poenget regner
    // med samme tall. Se `lib/cup/cupMatchAllowance.ts`.
    const modeConfig = (game.mode_config ?? null) as {
      allowance_pct?: number;
      team_strokes_override?: { team1: number; team2: number };
    } | null;

    const scoresInput = gScores.map((s) => ({
      userId: s.user_id,
      holeNumber: s.hole_number,
      gross: s.strokes,
    }));
    const side1Input = side1Players.map((p) => ({
      userId: p.user_id,
      courseHandicap: p.course_handicap ?? 0,
    }));
    const side2Input = side2Players.map((p) => ({
      userId: p.user_id,
      courseHandicap: p.course_handicap ?? 0,
    }));

    let result: CupMatchInput['result'];
    if (game.game_mode === 'best_ball') {
      // #1441 (D4/D11): back9-hosten poengsettes på netto LAGTOTAL, ikke
      // hull-for-hull matchplay — `computeCupMatchResult`s
      // `MATCHPLAY_CONFIG` har ingen `best_ball`-rad (og skal ikke ha, det
      // er en fundamentalt annen sammenligning).
      result = computeCupBestBallAward({
        side1: side1Input,
        side2: side2Input,
        holes: holes.map((h) => ({ number: h.number, strokeIndex: h.strokeIndex })),
        scores: scoresInput,
      });
    } else {
      // Match-scoring via tabell-drevet dispatcher (#331). Dekker alle seks
      // matchplay-modi (singles/fourball/foursomes/greensome/chapman/gruesome)
      // med riktig compute-fn + allowance-default per modus. Returnerer null
      // når game_mode ikke er matchplay, side-størrelsen ikke matcher, eller
      // matchen ikke er avgjort ennå. allowance_pct leses fra mode_config
      // (helperen defaulter per modus når feltet mangler).
      result = computeCupMatchResult({
        gameId: game.id,
        gameMode: game.game_mode,
        modeConfig,
        side1: side1Input,
        side2: side2Input,
        holes,
        scores: scoresInput,
      });
    }

    // Blind cup-dag (#1441, D12): en bunt-match (`score_visibility='reveal'`)
    // eksponerer INGEN resultat før arrangøren avslutter den — uansett om
    // scorene alt gjør utfallet avgjørbart. Poeng var (og forblir) allerede
    // kun tildelt ferdige spill (`computeCupLeaderboard.pointsForMatch` gater
    // på `status !== 'finished'`); dette gater kun det VISTE resultatet.
    // Non-reveal-spill (dagens 'live'-default) beholder dagens oppførsel: et
    // avgjort resultat vises så snart scorene avgjør det, uavhengig av status.
    if (game.score_visibility === 'reveal' && game.status !== 'finished') {
      result = null;
    }

    // Navn-label per side: singles bruker enkelt-navn, lag-format (fourball/
    // foursomes/greensome/chapman/gruesome/best_ball) joiner med «/». Defensiv:
    // tom side rendres som `unknownLabel` via formatSideLabel.
    const team1Label = formatSideLabel(side1Players, unknownLabel);
    const team2Label = formatSideLabel(side2Players, unknownLabel);

    // Typesikker fallback hvis en future game_mode skulle vises i en cup.
    // `best_ball` (D4-hostens back9-match) er lag-formatert på lik linje med
    // fourball/foursomes/greensome/chapman/gruesome — `CupMatchInput.gameMode`
    // (computeCupLeaderboard) har et eget `best_ball`-medlem, og
    // `isTeamMatchGameMode` styrer spiller- vs. lag-navn i UI-en (#1441, F5).
    const matchGameMode: NonNullable<CupMatchInput['gameMode']> =
      game.game_mode === 'best_ball'
        ? 'best_ball'
        : game.game_mode === 'fourball_matchplay'
          ? 'fourball_matchplay'
          : game.game_mode === 'foursomes_matchplay'
            ? 'foursomes_matchplay'
            : game.game_mode === 'greensome_matchplay'
              ? 'greensome_matchplay'
              : game.game_mode === 'chapman_matchplay'
                ? 'chapman_matchplay'
                : game.game_mode === 'gruesome_matchplay'
                  ? 'gruesome_matchplay'
                  : 'singles_matchplay';

    matchInputs.push({
      gameId: game.id,
      matchLabel: game.tournament_match_label,
      team1PlayerName: team1Label,
      team2PlayerName: team2Label,
      gameMode: matchGameMode,
      status: game.status,
      result,
      sourceGameId: game.source_game_id,
      allScorecardsSubmitted,
      allPlayersWithdrawn,
      // #1497: spiller-ID-ene per side, slik at per-spiller-regnskapet
      // (computeCupPlayerPoints) kan kreditere hver spiller på siden hele
      // sidens kamppoeng.
      team1UserIds: side1Players.map((p) => p.user_id),
      team2UserIds: side2Players.map((p) => p.user_id),
    });
  }

  // #1441 (D9): map sidepoeng-innslagenes `winner_user_id` til hvilket LAG
  // spilleren tilhører via rosteret bygget over — `winnerTeam: null` for
  // uregistrert vinner (arrangøren har ikke tastet ennå) OG for en vinner som
  // ikke finnes i rosteret (defensivt — kan ikke skje via
  // `registerSideAwardWinner`s egen roster-validering, men laget her tar ikke
  // det for gitt).
  //
  // #1489: gir-rader foldes ut til ett leaderboard-innslag PER klarte GIR per
  // lag (poeng = teller × points, summert av motoren) — null-tellere
  // (uregistrert) og 0-tellere gir begge ingen innslag. ctp/ld-slot-rader får
  // `slotCount` = antall søsken med samme (kind, hull, points) for «1 av
  // 3»-nummereringen; gruppering per points slik at umulige DB-tilstander
  // (samme kind+hull med ulik points) vises som de ligger i stedet for å slå
  // sammen på tvers.
  const allSideAwardRows = (sideAwardRows ?? []) as SideAwardRow[];
  const slotCountByKey = new Map<string, number>();
  for (const row of allSideAwardRows) {
    if (row.kind === 'gir') continue;
    const key = `${row.kind}#${row.hole_number}#${row.points}`;
    slotCountByKey.set(key, (slotCountByKey.get(key) ?? 0) + 1);
  }

  const sideAwardsForLeaderboard: CupSideAwardInput[] = [];
  const sideAwards: CupSideAwardSnapshot[] = [];
  for (const row of allSideAwardRows) {
    if (row.kind === 'gir') {
      const team1Count = row.gir_team1_count;
      const team2Count = row.gir_team2_count;
      for (let i = 0; i < (team1Count ?? 0); i++) {
        sideAwardsForLeaderboard.push({ kind: 'gir', holeNumber: row.hole_number, points: row.points, winnerTeam: 1 });
      }
      for (let i = 0; i < (team2Count ?? 0); i++) {
        sideAwardsForLeaderboard.push({ kind: 'gir', holeNumber: row.hole_number, points: row.points, winnerTeam: 2 });
      }
      sideAwards.push({
        id: row.id,
        kind: 'gir',
        holeNumber: row.hole_number,
        points: row.points,
        maxPerTeam: row.gir_max_per_team ?? 1,
        team1Count,
        team2Count,
      });
      continue;
    }
    const kind: 'ctp' | 'ld' = row.kind === 'ld' ? 'ld' : 'ctp';
    const winnerTeam: 1 | 2 | null = !row.winner_user_id
      ? null
      : team1Map.has(row.winner_user_id)
        ? 1
        : team2Map.has(row.winner_user_id)
          ? 2
          : null;
    sideAwardsForLeaderboard.push({ kind, holeNumber: row.hole_number, points: row.points, winnerTeam });
    sideAwards.push({
      id: row.id,
      kind,
      holeNumber: row.hole_number,
      points: row.points,
      slot: row.slot,
      slotCount: slotCountByKey.get(`${row.kind}#${row.hole_number}#${row.points}`) ?? 1,
      winnerUserId: row.winner_user_id,
      winnerTeam,
      // `?? false` holder eldre rader (og test-fixturer skrevet før 0157)
      // trygge: fravær av flagget betyr «ikke tastet ennå», ikke «ingen vant».
      noWinner: row.no_winner ?? false,
    });
  }

  const tournamentInput: TournamentInput = {
    team_1_name: t.team_1_name,
    team_2_name: t.team_2_name,
    points_to_win: t.points_to_win,
    status: t.status,
    winner_team: t.winner_team,
    win_points: t.win_points,
    tie_points: t.tie_points,
  };

  const leaderboard = computeCupLeaderboard(tournamentInput, matchInputs, sideAwardsForLeaderboard);

  return {
    tournament: t,
    leaderboard,
    sideAwards,
    performanceInputs,
    roster: {
      team1: Array.from(team1Map.values()),
      team2: Array.from(team2Map.values()),
    },
  };
}
