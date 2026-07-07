import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import type { SideWinnerRow } from './leaderboardTypes';
import { safeParsePrizes } from '@/lib/games/prizes';
import {
  linkPrizesToWinners,
  type PrizeAward,
  type PrizeWinnerPlayer,
  type PrizeSideWinner,
} from '@/lib/games/prizeAwards';
import type { ResultSummary } from '@/lib/scoring/resultSummary';
import { formatRevealName } from '@/lib/names/formatRevealName';

// Request-scoped Supabase client + verified user id. Shared by every
// Suspense body in this route so we don't pay a cookie-auth round-trip
// per section. Defined once here (#682) so every leaderboard render module
// imports the SAME cached function reference — `cache()` only dedups across
// callers that share the reference.
export const getLeaderboardContext = cache(async () => {
  const supabase = await getServerClient();
  const userId = await getProxyVerifiedUserId();
  return { supabase, userId };
});

/**
 * Henter LD/CTP-vinnerne for et spill. Trukket ut (#682) så best-ball-finish-
 * stien (`LeaderboardBody`) og `computeSideTournament` deler ETT spørringssted
 * i stedet for to identiske `game_side_winners`-queries. RLS slipper kun
 * spillere gjennom når status=finished, som begge kall-stedene allerede har
 * bekreftet via view-branching.
 *
 * Accepts any `SupabaseClient<Database>` — both the cookie-based server client
 * and the service-role admin client (#938 spectate route) satisfy this type.
 */
export async function fetchSideWinners(
  supabase: SupabaseClient<Database>,
  gameId: string,
): Promise<SideWinnerRow[]> {
  const sideWinnersRes = await supabase
    .from('game_side_winners')
    .select('category, position, winner_user_id')
    .eq('game_id', gameId)
    .order('category')
    .order('position')
    .returns<SideWinnerRow[]>();
  if (sideWinnersRes.error) throw sideWinnersRes.error;
  return sideWinnersRes.data ?? [];
}

/**
 * #1051: kobler et avsluttet spills premiebord til vinnerne. Henter per-spiller
 * `result_summary` (rank) + navn og `game_side_winners` (LD/CTP), og kjører den
 * rene `linkPrizesToWinners`. Returnerer [] når spillet ikke har premier eller
 * ingen premie fikk vinner — call-siten rendrer da ingen Premieutdeling.
 *
 * Delt helper (ikke bundet til best-ball-stien) så andre format-renderere kan
 * gjenbruke den når Premieutdelingen utvides til flere flater.
 */
export async function buildPrizeAwards(
  supabase: SupabaseClient<Database>,
  gameId: string,
  prizesRaw: unknown,
): Promise<PrizeAward[]> {
  const prizes = safeParsePrizes(prizesRaw);
  if (prizes.length === 0) return [];

  const [playersRes, sideWinners] = await Promise.all([
    supabase
      .from('game_players')
      .select('user_id, result_summary, users(name, nickname)')
      .eq('game_id', gameId),
    fetchSideWinners(supabase, gameId),
  ]);
  if (playersRes.error) throw playersRes.error;

  const players: PrizeWinnerPlayer[] = (playersRes.data ?? []).map((r) => {
    const u = Array.isArray(r.users) ? r.users[0] : r.users;
    return {
      userId: r.user_id,
      name: formatRevealName(u?.name ?? '', u?.nickname ?? null),
      resultSummary: (r.result_summary as ResultSummary | null) ?? null,
    };
  });

  const sideWins: PrizeSideWinner[] = sideWinners.map((s) => ({
    category: s.category,
    position: s.position,
    winnerUserId: s.winner_user_id,
  }));

  return linkPrizesToWinners(prizes, players, sideWins);
}
