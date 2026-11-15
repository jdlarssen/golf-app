/**
 * The read behind «Meldt inn fra kampene» in the cup's «Etter runden» (#2283,
 * drawings V3/V4). The web's cup page and the app's manage route both call
 * `loadCupSideReports` after the cup's organiser gate (`requireCupManager`,
 * the admin and club routes), so the matches, the names and the claims are
 * read in one place and put together by `buildCupSideReports`.
 *
 * It goes through the admin client because the claim tables' SELECT policy
 * shows a player only their own flight; the organiser reads every match. The
 * gate in front of the caller is the enforcement, as for the finish page
 * (`finishSideSlots.ts`).
 *
 * A failed read must never stop the organiser from registering: it comes back
 * as `'failed'`, logged and never thrown, and the surface says so while the
 * selects and the counters work as before.
 */
import { getAdminClient } from '@/lib/supabase/admin';
import { selectAllRows } from '@/lib/supabase/selectAllRows';
import type { GameMode } from '@/lib/scoring/modes/types';
import type { HoleSegment } from '@/lib/scoring/holeSegment';
import {
  buildCupSideReports,
  type CupGirClaimRow,
  type CupReportAward,
  type CupReportGame,
  type CupSideClaimRow,
  type CupSideReportsResult,
} from './cupSideReports';
import type { CupSideAwardSnapshot } from './cupSideAwardSnapshot';

type GameRow = {
  id: string;
  status: CupReportGame['status'];
  game_mode: GameMode;
  tournament_match_label: string | null;
  hole_segment: HoleSegment;
  source_game_id: string | null;
};

type PlayerRow = {
  game_id: string;
  user_id: string;
  team_number: number | null;
  withdrawn_at: string | null;
  // many-to-one: PostgREST gives an object, or null.
  users: { name: string | null; nickname: string | null } | null;
};

const GAME_COLUMNS = 'id, status, game_mode, tournament_match_label, hole_segment, source_game_id';
const PLAYER_COLUMNS =
  'game_id, user_id, team_number, withdrawn_at, users!game_players_user_id_fkey(name, nickname)';
// Not `users`: both claim tables have two foreign keys to it (`embedAmbiguity.ts`).
const SIDE_CLAIM_COLUMNS = 'game_id, category, hole_number, flight_number, winner_user_id, distance_m';
const GIR_CLAIM_COLUMNS = 'game_id, hole_number, user_id, hit';

function toReportAward(award: CupSideAwardSnapshot): CupReportAward {
  return award.kind === 'gir'
    ? { kind: 'gir', holeNumber: award.holeNumber, maxPerTeam: award.maxPerTeam }
    : { kind: award.kind, holeNumber: award.holeNumber };
}

/**
 * What the cup's matches reported for its side awards. `null` and nothing read
 * when the cup has no awards, or has not started (a draft cup has no match in
 * play to report from); `'failed'` when a read did not work.
 */
export async function loadCupSideReports(args: {
  tournamentId: string;
  status: 'draft' | 'active' | 'finished';
  awards: readonly CupSideAwardSnapshot[];
}): Promise<CupSideReportsResult> {
  const { tournamentId, status, awards } = args;
  if (awards.length === 0 || status === 'draft') return null;

  try {
    const admin = getAdminClient();
    const { data: gameRows, error: gamesError } = await admin
      .from('games')
      .select(GAME_COLUMNS)
      .eq('tournament_id', tournamentId)
      .order('created_at', { ascending: true })
      .order('id')
      .returns<GameRow[]>();
    if (gamesError) throw gamesError;

    const gameIds = (gameRows ?? []).map((game) => game.id);
    const wantsSide = awards.some((award) => award.kind !== 'gir');
    const wantsGir = awards.some((award) => award.kind === 'gir');

    const [players, sideClaims, girClaims] =
      gameIds.length === 0
        ? [[], [], []]
        : await Promise.all([
            selectAllRows(
              (from, to) =>
                admin
                  .from('game_players')
                  .select(PLAYER_COLUMNS)
                  .in('game_id', gameIds)
                  .order('game_id')
                  .order('user_id')
                  .range(from, to)
                  .returns<PlayerRow[]>(),
              'loadCupSideReports game_players',
            ),
            wantsSide
              ? selectAllRows(
                  (from, to) =>
                    admin
                      .from('game_side_claims')
                      .select(SIDE_CLAIM_COLUMNS)
                      .in('game_id', gameIds)
                      .order('game_id')
                      .order('category')
                      .order('hole_number')
                      .order('flight_number')
                      .range(from, to)
                      .returns<CupSideClaimRow[]>(),
                  'loadCupSideReports game_side_claims',
                )
              : Promise.resolve<CupSideClaimRow[]>([]),
            wantsGir
              ? selectAllRows(
                  (from, to) =>
                    admin
                      .from('game_gir_claims')
                      .select(GIR_CLAIM_COLUMNS)
                      .in('game_id', gameIds)
                      .order('game_id')
                      .order('hole_number')
                      .order('user_id')
                      .range(from, to)
                      .returns<CupGirClaimRow[]>(),
                  'loadCupSideReports game_gir_claims',
                )
              : Promise.resolve<CupGirClaimRow[]>([]),
          ]);

    const playersByGame = new Map<string, PlayerRow[]>();
    for (const player of players) {
      const rows = playersByGame.get(player.game_id) ?? [];
      rows.push(player);
      playersByGame.set(player.game_id, rows);
    }

    return buildCupSideReports({
      awards: awards.map(toReportAward),
      games: (gameRows ?? []).map(
        (game): CupReportGame => ({
          id: game.id,
          status: game.status,
          gameMode: game.game_mode,
          holeSegment: game.hole_segment,
          sourceGameId: game.source_game_id,
          matchLabel: game.tournament_match_label,
          players: playersByGame.get(game.id) ?? [],
        }),
      ),
      sideClaims,
      girClaims,
    });
  } catch (err) {
    console.error("[loadCupSideReports] could not read the matches' reports", err);
    return 'failed';
  }
}
