import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import {
  COURSE_HOLES_SELECT,
  SCORES_SELECT,
  type CourseHoleRow,
  type ScoreRow,
} from '@/lib/supabase/queryFragments';
import type {
  ModeResult,
  WolfChoice,
  WolfHoleChoice,
  BingoBangoBongoHoleInput,
} from '@/lib/scoring/modes/types';
import { selectAllRowsResult } from '@/lib/supabase/selectAllRows';
import {
  buildModeResultFromData,
  type GameForScoring,
  type GamePlayerRow,
  type ModeResultExtras,
} from '@/lib/scoring/buildModeResultFromData';

// Den rene delen (radene → `ModeResult`, og format-switchen) bor i
// `buildModeResultFromData.ts` uten `server-only`, så native-appen kan bruke
// den (#2228). Her bor hentingen. Re-eksporten holder importørene urørte.
export { buildModeResultFromData };
export type { GameForScoring, ModeResultExtras };

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
  client: SupabaseClient<Database>,
  game: GameForScoring,
): Promise<ModeResult | null> {
  // #1441 (D3): a derived game owns no scores of its own — read the host's.
  // `?? game.id` is a no-op for every non-derived game (source_game_id null).
  const scoresGameId = game.source_game_id ?? game.id;

  const [playersRes, holesRes, scoresRes] = await Promise.all([
    client
      .from('game_players')
      .select(
        // FK hint required: game_players has 3 FKs to users (#798) — without it
        // PostgREST returns PGRST201 and result_summary is never persisted.
        'user_id, team_number, flight_number, course_handicap, tee_gender, withdrawn_at, users!game_players_user_id_fkey(name, nickname)',
      )
      .eq('game_id', game.id)
      .returns<GamePlayerRow[]>(),
    client
      .from('course_holes')
      .select(COURSE_HOLES_SELECT)
      .eq('course_id', game.course_id)
      .order('hole_number', { ascending: true })
      .returns<CourseHoleRow[]>(),
    selectAllRowsResult(
      (from, to) =>
        client
          .from('scores')
          .select(SCORES_SELECT)
          .eq('game_id', scoresGameId)
          .order('id')
          .range(from, to)
          .returns<ScoreRow[]>(),
      'buildModeResultForGame scores',
    ),
  ]);

  if (playersRes.error) throw playersRes.error;
  if (holesRes.error) throw holesRes.error;
  if (scoresRes.error) throw scoresRes.error;

  // Wolf/BBB per-hull-valg hentes kun for de to modusene som trenger dem.
  const extras: ModeResultExtras = {};
  if (game.game_mode === 'wolf') {
    extras.wolfChoices = await fetchWolfChoices(client, game.id);
  } else if (game.game_mode === 'bingo_bango_bongo') {
    extras.bingoBangoBongoHoles = await fetchBingoBangoBongoHoles(client, game.id);
  }

  return buildModeResultFromData(
    game,
    playersRes.data ?? [],
    holesRes.data ?? [],
    scoresRes.data ?? [],
    extras,
  );
}

async function fetchWolfChoices(
  client: SupabaseClient<Database>,
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
  client: SupabaseClient<Database>,
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
