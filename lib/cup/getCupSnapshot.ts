import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { compute as computeSinglesMatchplay } from '@/lib/scoring/modes/singlesMatchplay';
import { compute as computeFourballMatchplay } from '@/lib/scoring/modes/fourballMatchplay';
import { compute as computeFoursomesMatchplay } from '@/lib/scoring/modes/foursomesMatchplay';
import { compute as computeChapmanMatchplay } from '@/lib/scoring/modes/chapmanMatchplay';
import { compute as computeGruesomeMatchplay } from '@/lib/scoring/modes/gruesomeMatchplay';
import type { ScoringContext } from '@/lib/scoring/modes/types';
import type { GameStatus } from '@/lib/games/status';
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

export type CupSnapshot = {
  tournament: {
    id: string;
    name: string;
    team_1_name: string;
    team_2_name: string;
    points_to_win: number;
    status: 'draft' | 'active' | 'finished';
    winner_team: 1 | 2 | null;
    created_by: string;
    created_at: string;
    started_at: string | null;
    finished_at: string | null;
  };
  leaderboard: CupLeaderboardResult;
  roster: CupRoster;
};

type GameRow = {
  id: string;
  name: string;
  status: GameStatus;
  game_mode: string;
  mode_config: unknown;
  tournament_match_label: string | null;
};

type UserRel = { name: string | null; nickname: string | null };
type PlayerRow = {
  game_id: string;
  user_id: string;
  team_number: number | null;
  course_handicap: number | null;
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

function preferredName(p: { name: string | null; nickname: string | null } | null): string {
  if (!p) return 'Ukjent spiller';
  return p.nickname?.trim() || p.name?.trim() || 'Ukjent spiller';
}

/**
 * Bygger en visnings-label for en sides spillere. Singles (1 spiller) → ett
 * navn. Fourball (2 spillere) → «Navn1/Navn2», sortert deterministisk via
 * eksisterende `user_id`-rekkefølge fra Supabase-queriet. Tom side → «Ukjent
 * spiller» som defensiv fallback. #217.
 */
function formatSideLabel(sidePlayers: PlayerRow[]): string {
  if (sidePlayers.length === 0) return 'Ukjent spiller';
  if (sidePlayers.length === 1) return preferredName(userOf(sidePlayers[0].users));
  return sidePlayers.map((p) => preferredName(userOf(p.users))).join('/');
}

export async function getCupSnapshot(tournamentId: string): Promise<CupSnapshot | null> {
  const supabase = getAdminClient();

  const { data: tournament, error: tErr } = await supabase
    .from('tournaments')
    .select(
      'id, name, team_1_name, team_2_name, points_to_win, status, winner_team, created_by, created_at, started_at, finished_at',
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
      'id, name, status, game_mode, mode_config, tournament_match_label, course_id, tee_box_id, created_at',
    )
    .eq('tournament_id', tournamentId)
    .order('created_at', { ascending: true });
  if (gErr) throw gErr;

  const games = (gameRows ?? []) as Array<
    GameRow & { course_id: string | null; tee_box_id: string | null; created_at: string }
  >;
  const gameIds = games.map((g) => g.id);

  const [playersRes, scoresRes, holesByCourseRes] = await Promise.all([
    gameIds.length === 0
      ? Promise.resolve({ data: [] as PlayerRow[], error: null })
      : supabase
          .from('game_players')
          .select(
            'game_id, user_id, team_number, course_handicap, users!game_players_user_id_fkey(name, nickname)',
          )
          .in('game_id', gameIds),
    gameIds.length === 0
      ? Promise.resolve({ data: [] as ScoreRow[], error: null })
      : supabase
          .from('scores')
          .select('game_id, user_id, hole_number, strokes')
          .in('game_id', gameIds),
    games.length === 0
      ? Promise.resolve({
          data: [] as Array<{ course_id: string; hole_number: number; par: number; stroke_index: number }>,
          error: null,
        })
      : supabase
          .from('course_holes')
          .select('course_id, hole_number, par, stroke_index')
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
    par: number;
    stroke_index: number;
  }>) {
    const arr = holesByCourse.get(row.course_id) ?? [];
    arr.push({ number: row.hole_number, par: row.par, strokeIndex: row.stroke_index });
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

  const matchInputs: CupMatchInput[] = [];

  // Roster: distinct players grouped by team_number across all matches.
  const team1Map = new Map<string, CupRosterPlayer>();
  const team2Map = new Map<string, CupRosterPlayer>();

  for (const game of games) {
    const gPlayers = playersByGame.get(game.id) ?? [];
    const gScores = scoresByGame.get(game.id) ?? [];
    const holes = (game.course_id && holesByCourse.get(game.course_id)) || [];

    // Per side: alle spillere med team_number 1 eller 2. Singles har 1 per side,
    // fourball har 2 per side. Generaliser fra .find() til array for å støtte
    // begge.
    const side1Players = gPlayers.filter((p) => p.team_number === 1);
    const side2Players = gPlayers.filter((p) => p.team_number === 2);

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

    let result: CupMatchInput['result'] = null;
    // Singles matchplay: 1 spiller per side, gjenbruker eksisterende scoring-modul.
    if (
      game.game_mode === 'singles_matchplay' &&
      side1Players.length === 1 &&
      side2Players.length === 1
    ) {
      const side1 = side1Players[0];
      const side2 = side2Players[0];
      const ctx: ScoringContext = {
        game: {
          id: game.id,
          game_mode: 'singles_matchplay',
          mode_config: { kind: 'singles_matchplay', team_size: 1, teams_count: 2 },
        },
        players: [
          {
            userId: side1.user_id,
            teamNumber: 1,
            flightNumber: null,
            courseHandicap: side1.course_handicap ?? 0,
          },
          {
            userId: side2.user_id,
            teamNumber: 2,
            flightNumber: null,
            courseHandicap: side2.course_handicap ?? 0,
          },
        ],
        holes,
        scores: gScores.map((s) => ({
          userId: s.user_id,
          holeNumber: s.hole_number,
          gross: s.strokes,
        })),
      };
      const r = computeSinglesMatchplay(ctx);
      if (r.result) {
        const winnerSide: 1 | 2 | 'tied' =
          r.result.winner === 'side1' ? 1 : r.result.winner === 'side2' ? 2 : 'tied';
        result = { winnerSide, formatted: r.result.formatted };
      }
    }

    // Fourball matchplay (#217): 2 spillere per side, lag-best per hull,
    // sammenlikn som matchplay. Henter allowance_pct fra games.mode_config (eller
    // defaulter til 100 hvis manglende — scoring-laget håndterer det defensivt).
    if (
      game.game_mode === 'fourball_matchplay' &&
      side1Players.length === 2 &&
      side2Players.length === 2
    ) {
      const modeConfig = (game.mode_config ?? null) as {
        kind?: string;
        allowance_pct?: number;
      } | null;
      const allowancePct =
        modeConfig && typeof modeConfig.allowance_pct === 'number'
          ? modeConfig.allowance_pct
          : 100;
      const ctx: ScoringContext = {
        game: {
          id: game.id,
          game_mode: 'fourball_matchplay',
          mode_config: {
            kind: 'fourball_matchplay',
            team_size: 2,
            teams_count: 2,
            allowance_pct: allowancePct,
          },
        },
        players: [...side1Players, ...side2Players].map((p) => ({
          userId: p.user_id,
          teamNumber: p.team_number,
          flightNumber: null,
          courseHandicap: p.course_handicap ?? 0,
        })),
        holes,
        scores: gScores.map((s) => ({
          userId: s.user_id,
          holeNumber: s.hole_number,
          gross: s.strokes,
        })),
      };
      const r = computeFourballMatchplay(ctx);
      if (r.result) {
        const winnerSide: 1 | 2 | 'tied' =
          r.result.winner === 'side1' ? 1 : r.result.winner === 'side2' ? 2 : 'tied';
        result = { winnerSide, formatted: r.result.formatted };
      }
    }

    // Foursomes matchplay (#218): 2 spillere per side, én ball per lag
    // (kaptein-pattern), WHS-diff-allowance. Henter allowance_pct fra
    // games.mode_config (defaulter til 50 hvis manglende — WHS-standard).
    if (
      game.game_mode === 'foursomes_matchplay' &&
      side1Players.length === 2 &&
      side2Players.length === 2
    ) {
      const modeConfig = (game.mode_config ?? null) as {
        kind?: string;
        allowance_pct?: number;
      } | null;
      const allowancePct =
        modeConfig && typeof modeConfig.allowance_pct === 'number'
          ? modeConfig.allowance_pct
          : 50;
      const ctx: ScoringContext = {
        game: {
          id: game.id,
          game_mode: 'foursomes_matchplay',
          mode_config: {
            kind: 'foursomes_matchplay',
            team_size: 2,
            teams_count: 2,
            allowance_pct: allowancePct,
          },
        },
        players: [...side1Players, ...side2Players].map((p) => ({
          userId: p.user_id,
          teamNumber: p.team_number,
          flightNumber: null,
          courseHandicap: p.course_handicap ?? 0,
        })),
        holes,
        scores: gScores.map((s) => ({
          userId: s.user_id,
          holeNumber: s.hole_number,
          gross: s.strokes,
        })),
      };
      const r = computeFoursomesMatchplay(ctx);
      if (r.result) {
        const winnerSide: 1 | 2 | 'tied' =
          r.result.winner === 'side1' ? 1 : r.result.winner === 'side2' ? 2 : 'tied';
        result = { winnerSide, formatted: r.result.formatted };
      }
    }

    // Chapman matchplay (#290): 2 spillere per side, én ball per lag (samme
    // kaptein-pattern som foursomes), 60/40-side-handicap. Henter allowance_pct
    // fra games.mode_config (defaulter til 100 — WHS Chapman matchplay-standard).
    if (
      game.game_mode === 'chapman_matchplay' &&
      side1Players.length === 2 &&
      side2Players.length === 2
    ) {
      const modeConfig = (game.mode_config ?? null) as {
        kind?: string;
        allowance_pct?: number;
      } | null;
      const allowancePct =
        modeConfig && typeof modeConfig.allowance_pct === 'number'
          ? modeConfig.allowance_pct
          : 100;
      const ctx: ScoringContext = {
        game: {
          id: game.id,
          game_mode: 'chapman_matchplay',
          mode_config: {
            kind: 'chapman_matchplay',
            team_size: 2,
            teams_count: 2,
            allowance_pct: allowancePct,
          },
        },
        players: [...side1Players, ...side2Players].map((p) => ({
          userId: p.user_id,
          teamNumber: p.team_number,
          flightNumber: null,
          courseHandicap: p.course_handicap ?? 0,
        })),
        holes,
        scores: gScores.map((s) => ({
          userId: s.user_id,
          holeNumber: s.hole_number,
          gross: s.strokes,
        })),
      };
      const r = computeChapmanMatchplay(ctx);
      if (r.result) {
        const winnerSide: 1 | 2 | 'tied' =
          r.result.winner === 'side1' ? 1 : r.result.winner === 'side2' ? 2 : 'tied';
        result = { winnerSide, formatted: r.result.formatted };
      }
    }

    // Gruesome matchplay (#291): 2 spillere per side, én ball per lag (samme
    // kaptein-pattern som foursomes), sum-side-handicap. Henter allowance_pct
    // fra games.mode_config (defaulter til 50 — WHS foursomes-standard).
    if (
      game.game_mode === 'gruesome_matchplay' &&
      side1Players.length === 2 &&
      side2Players.length === 2
    ) {
      const modeConfig = (game.mode_config ?? null) as {
        kind?: string;
        allowance_pct?: number;
      } | null;
      const allowancePct =
        modeConfig && typeof modeConfig.allowance_pct === 'number'
          ? modeConfig.allowance_pct
          : 50;
      const ctx: ScoringContext = {
        game: {
          id: game.id,
          game_mode: 'gruesome_matchplay',
          mode_config: {
            kind: 'gruesome_matchplay',
            team_size: 2,
            teams_count: 2,
            allowance_pct: allowancePct,
          },
        },
        players: [...side1Players, ...side2Players].map((p) => ({
          userId: p.user_id,
          teamNumber: p.team_number,
          flightNumber: null,
          courseHandicap: p.course_handicap ?? 0,
        })),
        holes,
        scores: gScores.map((s) => ({
          userId: s.user_id,
          holeNumber: s.hole_number,
          gross: s.strokes,
        })),
      };
      const r = computeGruesomeMatchplay(ctx);
      if (r.result) {
        const winnerSide: 1 | 2 | 'tied' =
          r.result.winner === 'side1' ? 1 : r.result.winner === 'side2' ? 2 : 'tied';
        result = { winnerSide, formatted: r.result.formatted };
      }
    }

    // Navn-label per side: singles bruker enkelt-navn, lag-format (fourball/
    // foursomes/greensome/chapman/gruesome) joiner med «/». Defensiv: tom side
    // rendres som «Ukjent spiller» via preferredName.
    const team1Label = formatSideLabel(side1Players);
    const team2Label = formatSideLabel(side2Players);

    // Bevart for backward-compat: typesikker fallback hvis future game_mode
    // skulle vises i en cup. Per d.d. er singles_matchplay, fourball_matchplay,
    // foursomes_matchplay, greensome_matchplay, chapman_matchplay og
    // gruesome_matchplay gyldige.
    const matchGameMode:
      | 'singles_matchplay'
      | 'fourball_matchplay'
      | 'foursomes_matchplay'
      | 'greensome_matchplay'
      | 'chapman_matchplay'
      | 'gruesome_matchplay' =
      game.game_mode === 'fourball_matchplay'
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
    });
  }

  const tournamentInput: TournamentInput = {
    team_1_name: t.team_1_name,
    team_2_name: t.team_2_name,
    points_to_win: t.points_to_win,
    status: t.status,
    winner_team: t.winner_team,
  };

  const leaderboard = computeCupLeaderboard(tournamentInput, matchInputs);

  return {
    tournament: t,
    leaderboard,
    roster: {
      team1: Array.from(team1Map.values()),
      team2: Array.from(team2Map.values()),
    },
  };
}
