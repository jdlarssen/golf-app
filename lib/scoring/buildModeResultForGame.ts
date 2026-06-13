import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { computeLeaderboard } from '@/lib/scoring';
import type {
  ModeResult,
  ScoringContext,
  GameMode,
  GameModeConfig,
  ScoringGender,
  WolfChoice,
  WolfHoleChoice,
  BingoBangoBongoHoleInput,
} from '@/lib/scoring/modes/types';
import { buildStablefordContext } from '@/lib/scoring/context/buildStablefordContext';
import { buildSoloStrokeplayContext } from '@/lib/scoring/context/buildSoloStrokeplayContext';
import { buildWolfContext } from '@/lib/scoring/context/buildWolfContext';
import { buildNassauContext } from '@/lib/scoring/context/buildNassauContext';
import { buildSkinsContext } from '@/lib/scoring/context/buildSkinsContext';
import { buildNinesContext } from '@/lib/scoring/context/buildNinesContext';
import { buildRoundRobinContext } from '@/lib/scoring/context/buildRoundRobinContext';
import { buildAceyDeuceyContext } from '@/lib/scoring/context/buildAceyDeuceyContext';
import { buildBingoBangoBongoContext } from '@/lib/scoring/context/buildBingoBangoBongoContext';

/**
 * Game-feltene scoring trenger. Matcher `endGame`-contextet + backfill-spørringen.
 */
export interface GameForScoring {
  id: string;
  game_mode: GameMode;
  mode_config: GameModeConfig;
  course_id: string;
}

interface GamePlayerRow {
  user_id: string;
  team_number: number;
  flight_number: number | null;
  course_handicap: number | null;
  tee_gender: ScoringGender;
  withdrawn_at: string | null;
  users: { name: string | null; nickname: string | null } | null;
}

interface CourseHoleRow {
  hole_number: number;
  par_mens: number;
  par_ladies: number;
  par_juniors: number;
  stroke_index: number;
}

interface ScoreRow {
  user_id: string;
  hole_number: number;
  strokes: number | null;
}

/**
 * Bygger `ModeResult` (samme som leaderboard-siden) for ett spill — uavhengig av
 * request-kontekst, så både `endGame` (server action) og backfill-scriptet (rent
 * Node) kan bruke den.
 *
 * Gjenbruker de samme per-modus `build*Context`-helperne leaderboard-flaten bruker
 * (epic #496), så resultatet er identisk. Modi uten dedikert builder (best_ball,
 * matchplay-familien, scramble-familien, shamble, patsome) er alle lag-/side-format
 * der `team_number` alltid er satt — de deler én uniform context-bygging.
 *
 * Wolf/BBB henter per-hull-valgene direkte fra tabellene via den oppgitte klienten
 * (ikke de `unstable_cache`-wrappede helperne — de virker ikke utenfor Next-runtime).
 *
 * Returnerer `null` når spillet ikke har baner/spillere/scores nok til et resultat,
 * så kallstedet kan la `result_summary` stå `null` (→ 🏆-fallback).
 */
export async function buildModeResultForGame(
  client: SupabaseClient,
  game: GameForScoring,
): Promise<ModeResult | null> {
  const [playersRes, holesRes, scoresRes] = await Promise.all([
    client
      .from('game_players')
      .select(
        'user_id, team_number, flight_number, course_handicap, tee_gender, withdrawn_at, users(name, nickname)',
      )
      .eq('game_id', game.id)
      .returns<GamePlayerRow[]>(),
    client
      .from('course_holes')
      .select('hole_number, par_mens, par_ladies, par_juniors, stroke_index')
      .eq('course_id', game.course_id)
      .order('hole_number', { ascending: true })
      .returns<CourseHoleRow[]>(),
    client
      .from('scores')
      .select('user_id, hole_number, strokes')
      .eq('game_id', game.id)
      .returns<ScoreRow[]>(),
  ]);

  if (playersRes.error) throw playersRes.error;
  if (holesRes.error) throw holesRes.error;
  if (scoresRes.error) throw scoresRes.error;

  const players = (playersRes.data ?? []).map((p) => ({
    ...p,
    team_number: p.team_number ?? 0,
  }));
  const holesRows = holesRes.data ?? [];
  const scoresRows = scoresRes.data ?? [];

  // Ingen hull eller spillere → ikke noe meningsfullt resultat å lagre.
  if (holesRows.length === 0 || players.length === 0) return null;

  const ctx = await buildContext(client, game, players, holesRows, scoresRows);
  if (ctx === null) return null;

  return computeLeaderboard(ctx);
}

async function buildContext(
  client: SupabaseClient,
  game: GameForScoring,
  players: GamePlayerRow[],
  holesRows: CourseHoleRow[],
  scoresRows: ScoreRow[],
): Promise<ScoringContext | null> {
  const mode = game.game_mode;

  switch (mode) {
    case 'stableford':
    case 'modified_stableford':
      return buildStablefordContext({
        gameId: game.id,
        gameMode: mode,
        modeConfig: game.mode_config,
        players,
        holesRows,
        scoresRows,
      });
    case 'solo_strokeplay':
      return buildSoloStrokeplayContext({
        gameId: game.id,
        modeConfig: game.mode_config,
        players,
        holesRows,
        scoresRows,
      });
    case 'nassau':
      return buildNassauContext({
        gameId: game.id,
        modeConfig: game.mode_config,
        players,
        holesRows,
        scoresRows,
      });
    case 'skins':
      return buildSkinsContext({
        gameId: game.id,
        modeConfig: game.mode_config,
        players,
        holesRows,
        scoresRows,
      });
    case 'nines':
      return buildNinesContext({
        gameId: game.id,
        modeConfig: game.mode_config,
        players,
        holesRows,
        scoresRows,
      });
    case 'round_robin':
      return buildRoundRobinContext({
        gameId: game.id,
        modeConfig: game.mode_config,
        players,
        holesRows,
        scoresRows,
      });
    case 'acey_deucey':
      return buildAceyDeuceyContext({
        gameId: game.id,
        modeConfig: game.mode_config,
        players,
        holesRows,
        scoresRows,
      });
    case 'wolf':
      return buildWolfContext({
        gameId: game.id,
        modeConfig: game.mode_config,
        players,
        holesRows,
        scoresRows,
        wolfChoices: await fetchWolfChoices(client, game.id),
      });
    case 'bingo_bango_bongo':
      return buildBingoBangoBongoContext({
        gameId: game.id,
        modeConfig: game.mode_config,
        players,
        holesRows,
        scoresRows,
        bingoBangoBongoHoles: await fetchBingoBangoBongoHoles(client, game.id),
      });
    // Lag-/side-format uten dedikert builder — uniform context, team_number er
    // alltid satt på disse, så WD-filtrering + felt-map er nok.
    case 'best_ball':
    case 'singles_matchplay':
    case 'fourball_matchplay':
    case 'foursomes_matchplay':
    case 'greensome_matchplay':
    case 'chapman_matchplay':
    case 'gruesome_matchplay':
    case 'texas_scramble':
    case 'ambrose':
    case 'florida_scramble':
    case 'shamble':
    case 'patsome':
      return buildUniformContext(game, players, holesRows, scoresRows);
    default:
      return assertNever(mode);
  }
}

/**
 * Uniform context for lag-/side-modi uten dedikert builder — speiler
 * leaderboard-sidens inline-mapping (`teamNumber: p.team_number ?? 0`,
 * `flightNumber: null`, WD-filtrert på både spillere og scores).
 */
function buildUniformContext(
  game: GameForScoring,
  players: GamePlayerRow[],
  holesRows: CourseHoleRow[],
  scoresRows: ScoreRow[],
): ScoringContext {
  const withdrawnIds = new Set(
    players.filter((p) => p.withdrawn_at != null).map((p) => p.user_id),
  );

  return {
    game: { id: game.id, game_mode: game.game_mode, mode_config: game.mode_config },
    players: players
      .filter((p) => p.users != null && p.withdrawn_at == null)
      .map((p) => ({
        userId: p.user_id,
        teamNumber: p.team_number ?? 0,
        flightNumber: null,
        courseHandicap: p.course_handicap ?? 0,
        teeGender: p.tee_gender,
      })),
    holes: holesRows.map((h) => ({
      number: h.hole_number,
      par: h.par_mens,
      parByGender: {
        mens: h.par_mens,
        ladies: h.par_ladies,
        juniors: h.par_juniors,
      },
      strokeIndex: h.stroke_index,
    })),
    scores: scoresRows
      .filter((s) => !withdrawnIds.has(s.user_id))
      .map((s) => ({
        userId: s.user_id,
        holeNumber: s.hole_number,
        gross: s.strokes,
      })),
  };
}

async function fetchWolfChoices(
  client: SupabaseClient,
  gameId: string,
): Promise<WolfHoleChoice[]> {
  const { data, error } = await client
    .from('wolf_hole_choices')
    .select('hole_number, wolf_user_id, choice, partner_user_id')
    .eq('game_id', gameId)
    .order('hole_number', { ascending: true })
    .returns<
      Array<{
        hole_number: number;
        wolf_user_id: string;
        choice: string;
        partner_user_id: string | null;
      }>
    >();
  if (error) throw error;
  return (data ?? []).map((row) => ({
    holeNumber: row.hole_number,
    wolfUserId: row.wolf_user_id,
    choice: row.choice as WolfChoice,
    partnerUserId: row.partner_user_id,
  }));
}

async function fetchBingoBangoBongoHoles(
  client: SupabaseClient,
  gameId: string,
): Promise<BingoBangoBongoHoleInput[]> {
  const { data, error } = await client
    .from('bingo_bango_bongo_holes')
    .select('hole_number, bingo_user_id, bango_user_id, bongo_user_id')
    .eq('game_id', gameId)
    .order('hole_number', { ascending: true })
    .returns<
      Array<{
        hole_number: number;
        bingo_user_id: string | null;
        bango_user_id: string | null;
        bongo_user_id: string | null;
      }>
    >();
  if (error) throw error;
  return (data ?? []).map((row) => ({
    holeNumber: row.hole_number,
    bingoUserId: row.bingo_user_id,
    bangoUserId: row.bango_user_id,
    bongoUserId: row.bongo_user_id,
  }));
}

function assertNever(x: never): never {
  throw new Error(`Unhandled game_mode in buildModeResultForGame: ${String(x)}`);
}
