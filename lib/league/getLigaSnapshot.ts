import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { compute as computeSoloStrokeplay } from '@/lib/scoring/modes/soloStrokeplay';
import type { ScoringContext } from '@/lib/scoring/modes/types';
import type { TeeGender } from '@/lib/games/teeRating';
import { computeLeagueStandings } from './computeLeagueStandings';
import type {
  LeagueRoundInput,
  LeagueRoundPlayerScore,
  LeagueStandingsByScoring,
  LeagueStandingsConfig,
  StandingsMetric,
} from './types';

/**
 * Server-side snapshot for a league (#453). Mirrors `getCupSnapshot`: loads the
 * league + rounds + flight-games + scores via the admin client (RLS-bypass so it
 * works from the public `/liga/[id]` server component), runs solo-strokeplay
 * scoring per finished flight, converts each player's net total to net-to-par
 * against the tee's par, and aggregates the season table via
 * `computeLeagueStandings`.
 *
 * Counting guardrails (contract #453):
 *  - only `finished` flights count;
 *  - a flight needs ≥2 non-withdrawn submitted players (the marker rule);
 *  - a player only counts with a complete card (holesPlayed === course holes);
 *  - withdrawn players are excluded.
 */

export type LeagueParticipant = {
  userId: string;
  name: string | null;
  nickname: string | null;
  /** #463: null = lagt til av arrangør, ikke bekreftet ennå. */
  acceptedAt: string | null;
};

export type LeagueRoundView = {
  id: string;
  sequence: number;
  label: string;
  courseId: string | null;
  teeBoxId: string | null;
  opensAt: string;
  closesAt: string;
  originalClosesAt: string;
  windowOverriddenAt: string | null;
  /** Flights in this round delivered after the original window (admin flag). */
  flaggedFlights: number;
  flightCount: number;
};

export type LeagueRow = {
  id: string;
  name: string;
  season_start: string;
  season_end: string;
  format: string;
  scoring: string;
  standings_model: string;
  missed_round_policy: string;
  penalty_kind: string;
  penalty_fixed_over_par: number | null;
  /** #452 Fase 2a: antall beste runder som teller under 'best_n'. */
  best_n_count: number | null;
  course_scope: string;
  course_id: string | null;
  tee_box_id: string | null;
  status: string;
  created_by: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  /** #480: klubb-tilknytning. null = frittstående liga. */
  group_id: string | null;
};

export type LeagueSnapshot = {
  league: LeagueRow;
  rounds: LeagueRoundView[];
  participants: LeagueParticipant[];
  /** Per scoring; `.net`/`.gross` is null when the league doesn't rank on it. */
  standings: LeagueStandingsByScoring;
};

type UserRel = { name: string | null; nickname: string | null };
const userOf = (rel: UserRel | UserRel[] | null | undefined): UserRel | null =>
  Array.isArray(rel) ? (rel[0] ?? null) : (rel ?? null);

export async function getLigaSnapshot(leagueId: string): Promise<LeagueSnapshot | null> {
  const supabase = getAdminClient();

  const { data: leagueRow, error: lErr } = await supabase
    .from('leagues')
    .select(
      'id, name, season_start, season_end, format, scoring, standings_model, missed_round_policy, penalty_kind, penalty_fixed_over_par, best_n_count, course_scope, course_id, tee_box_id, status, created_by, created_at, started_at, finished_at, group_id',
    )
    .eq('id', leagueId)
    .maybeSingle();
  if (lErr) throw lErr;
  if (!leagueRow) return null;
  const league = leagueRow as LeagueRow;

  const [roundsRes, participantsRes] = await Promise.all([
    supabase
      .from('league_rounds')
      .select(
        'id, sequence, label, course_id, tee_box_id, opens_at, closes_at, original_closes_at, window_overridden_at',
      )
      .eq('league_id', leagueId)
      .order('sequence', { ascending: true }),
    supabase
      .from('league_players')
      .select('user_id, accepted_at, users!league_players_user_id_fkey(name, nickname)')
      .eq('league_id', leagueId),
  ]);
  if (roundsRes.error) throw roundsRes.error;
  if (participantsRes.error) throw participantsRes.error;

  const rounds = (roundsRes.data ?? []) as Array<{
    id: string;
    sequence: number;
    label: string;
    course_id: string | null;
    tee_box_id: string | null;
    opens_at: string;
    closes_at: string;
    original_closes_at: string;
    window_overridden_at: string | null;
  }>;
  const participants: LeagueParticipant[] = (
    (participantsRes.data ?? []) as Array<{
      user_id: string;
      accepted_at: string | null;
      users: UserRel | UserRel[] | null;
    }>
  ).map((p) => {
    const u = userOf(p.users);
    return {
      userId: p.user_id,
      name: u?.name ?? null,
      nickname: u?.nickname ?? null,
      acceptedAt: p.accepted_at,
    };
  });

  const roundIds = rounds.map((r) => r.id);

  // ── flight-games for these rounds ───────────────────────────────────────────
  const { data: gameRows, error: gErr } = roundIds.length
    ? await supabase
        .from('games')
        .select(
          'id, status, course_id, tee_box_id, league_round_id, delivered_outside_window',
        )
        .in('league_round_id', roundIds)
    : { data: [], error: null };
  if (gErr) throw gErr;

  const games = (gameRows ?? []) as Array<{
    id: string;
    status: string;
    course_id: string | null;
    tee_box_id: string | null;
    league_round_id: string | null;
    delivered_outside_window: boolean;
  }>;
  const gameIds = games.map((g) => g.id);
  const courseIds = Array.from(
    new Set(games.map((g) => g.course_id).filter((id): id is string => Boolean(id))),
  );
  const teeBoxIds = Array.from(
    new Set(games.map((g) => g.tee_box_id).filter((id): id is string => Boolean(id))),
  );

  const [playersRes, scoresRes, holesRes, teesRes] = await Promise.all([
    gameIds.length
      ? supabase
          .from('game_players')
          .select('game_id, user_id, course_handicap, tee_gender, submitted_at, withdrawn_at')
          .in('game_id', gameIds)
      : Promise.resolve({ data: [], error: null }),
    gameIds.length
      ? supabase
          .from('scores')
          .select('game_id, user_id, hole_number, strokes')
          .in('game_id', gameIds)
      : Promise.resolve({ data: [], error: null }),
    courseIds.length
      ? supabase
          .from('course_holes')
          .select('course_id, hole_number, par, stroke_index')
          .in('course_id', courseIds)
      : Promise.resolve({ data: [], error: null }),
    teeBoxIds.length
      ? supabase
          .from('tee_boxes')
          .select('id, par_total_mens, par_total_ladies, par_total_juniors')
          .in('id', teeBoxIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (playersRes.error) throw playersRes.error;
  if (scoresRes.error) throw scoresRes.error;
  if (holesRes.error) throw holesRes.error;
  if (teesRes.error) throw teesRes.error;

  type PlayerRow = {
    game_id: string;
    user_id: string;
    course_handicap: number | null;
    tee_gender: TeeGender;
    submitted_at: string | null;
    withdrawn_at: string | null;
  };
  type ScoreRow = { game_id: string; user_id: string; hole_number: number; strokes: number | null };

  const gamePlayers = (playersRes.data ?? []) as PlayerRow[];
  const gameScores = (scoresRes.data ?? []) as ScoreRow[];

  const holesByCourse = new Map<string, Array<{ number: number; par: number; strokeIndex: number }>>();
  for (const h of (holesRes.data ?? []) as Array<{
    course_id: string;
    hole_number: number;
    par: number;
    stroke_index: number;
  }>) {
    const arr = holesByCourse.get(h.course_id) ?? [];
    arr.push({ number: h.hole_number, par: h.par, strokeIndex: h.stroke_index });
    holesByCourse.set(h.course_id, arr);
  }

  const teeParByGender = new Map<string, Record<TeeGender, number | null>>();
  for (const t of (teesRes.data ?? []) as Array<{
    id: string;
    par_total_mens: number | null;
    par_total_ladies: number | null;
    par_total_juniors: number | null;
  }>) {
    teeParByGender.set(t.id, {
      mens: t.par_total_mens,
      ladies: t.par_total_ladies,
      juniors: t.par_total_juniors,
    });
  }

  const playersByGame = new Map<string, PlayerRow[]>();
  for (const p of gamePlayers) {
    const arr = playersByGame.get(p.game_id) ?? [];
    arr.push(p);
    playersByGame.set(p.game_id, arr);
  }
  const scoresByGame = new Map<string, ScoreRow[]>();
  for (const s of gameScores) {
    const arr = scoresByGame.get(s.game_id) ?? [];
    arr.push(s);
    scoresByGame.set(s.game_id, arr);
  }

  // ── score each finished flight → per-round net-to-par ────────────────────────
  const roundScores = new Map<string, LeagueRoundPlayerScore[]>();
  const flaggedByRound = new Map<string, number>();
  const flightCountByRound = new Map<string, number>();

  for (const game of games) {
    const roundId = game.league_round_id;
    if (!roundId) continue;
    flightCountByRound.set(roundId, (flightCountByRound.get(roundId) ?? 0) + 1);
    if (game.delivered_outside_window) {
      flaggedByRound.set(roundId, (flaggedByRound.get(roundId) ?? 0) + 1);
    }
    if (game.status !== 'finished') continue;
    if (!game.course_id || !game.tee_box_id) continue;

    const holes = holesByCourse.get(game.course_id) ?? [];
    if (holes.length === 0) continue;
    const teePar = teeParByGender.get(game.tee_box_id);

    const allPlayers = playersByGame.get(game.id) ?? [];
    const eligible = allPlayers.filter((p) => p.withdrawn_at === null && p.submitted_at !== null);
    // Marker rule: a counted flight needs ≥2 players who actually delivered.
    if (eligible.length < 2) continue;

    const gScores = scoresByGame.get(game.id) ?? [];
    const ctx: ScoringContext = {
      game: {
        id: game.id,
        game_mode: 'solo_strokeplay',
        mode_config: { kind: 'solo_strokeplay', team_size: 1 },
      },
      players: eligible.map((p) => ({
        userId: p.user_id,
        teamNumber: 1,
        flightNumber: 1,
        courseHandicap: p.course_handicap ?? 0,
        teeGender: p.tee_gender,
      })),
      holes: holes.map((h) => ({ number: h.number, par: h.par, strokeIndex: h.strokeIndex })),
      scores: gScores.map((s) => ({ userId: s.user_id, holeNumber: s.hole_number, gross: s.strokes })),
    };

    const result = computeSoloStrokeplay(ctx);
    const genderByUser = new Map(eligible.map((p) => [p.user_id, p.tee_gender]));

    for (const line of result.players) {
      // Only complete cards count toward a league round.
      if (line.holesPlayed !== holes.length) continue;
      const gender = genderByUser.get(line.userId);
      const par = gender && teePar ? teePar[gender] : null;
      if (par === null || par === undefined) continue;

      const arr = roundScores.get(roundId) ?? [];
      arr.push({
        userId: line.userId,
        netToPar: line.totalNetStrokes - par,
        grossToPar: line.totalGrossStrokes - par,
        deliveredOutsideWindow: game.delivered_outside_window,
      });
      roundScores.set(roundId, arr);
    }
  }

  const roundInputs: LeagueRoundInput[] = rounds.map((r) => ({
    roundId: r.id,
    sequence: r.sequence,
    scores: roundScores.get(r.id) ?? [],
  }));

  const config: LeagueStandingsConfig = {
    standingsModel:
      league.standings_model === 'average'
        ? 'average'
        : league.standings_model === 'best_n'
          ? 'best_n'
          : 'total',
    missedRoundPolicy: league.missed_round_policy === 'must_play_all' ? 'must_play_all' : 'penalty',
    penaltyKind: league.penalty_kind === 'fixed' ? 'fixed' : 'worst_plus_one',
    penaltyFixedOverPar: league.penalty_fixed_over_par,
    bestNCount: league.best_n_count,
  };

  const playerIds = participants.map((p) => p.userId);
  const standingsFor = (metric: StandingsMetric) =>
    computeLeagueStandings(config, roundInputs, playerIds, metric);

  // `scoring` decides which tables to compute: net, gross, or both in parallel.
  const standings: LeagueStandingsByScoring = {
    net: league.scoring === 'gross' ? null : standingsFor('net'),
    gross: league.scoring === 'gross' || league.scoring === 'both' ? standingsFor('gross') : null,
  };

  const roundViews: LeagueRoundView[] = rounds.map((r) => ({
    id: r.id,
    sequence: r.sequence,
    label: r.label,
    courseId: r.course_id,
    teeBoxId: r.tee_box_id,
    opensAt: r.opens_at,
    closesAt: r.closes_at,
    originalClosesAt: r.original_closes_at,
    windowOverriddenAt: r.window_overridden_at,
    flaggedFlights: flaggedByRound.get(r.id) ?? 0,
    flightCount: flightCountByRound.get(r.id) ?? 0,
  }));

  return { league, rounds: roundViews, participants, standings };
}
