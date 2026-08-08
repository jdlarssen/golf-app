import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import type { GameStatus } from '@/lib/games/status';
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
 * Klienten et spills RESULTAT-data skal leses med (#1542). ETT hjem for regelen
 * «hvem får se et ferdigspilt scorekort».
 *
 * Bakgrunn: RLS-policyen `scores select gating per mode` krever i sin
 * finished-gren at leseren er deltaker i DET spillet — `games` likeså. Men
 * `page.tsx` slipper bevisst alle innloggede inn på ferdige spill, og
 * cup-matchkortene lenker hele startfeltet dit (#1456/#1468). Resultatet var et
 * tomt kort: hull og par rendret, alle slag «—», og lagnavnene tilbake på
 * generiske «Lag 1»/«Lag 2» fordi `tournament_id`-oppslaget også ble sperret.
 *
 * Fiksen speiler mønsteret ruta rundt allerede bruker — `getCupSnapshot`,
 * `/spectate/[token]` og `getGameWithPlayers` leser alle med service-role og
 * beholder autorisasjonen på call-site. Et ferdig spill er per definisjon
 * offentlig (`lib/games/status.ts`), så adgangen avgjøres av gaten i `page.tsx`,
 * ikke av RLS. Ingen policy-endring, ingen migrasjon.
 *
 * `fallback` er klienten kallstedet allerede holder. Den brukes uendret så lenge
 * spillet IKKE er ferdig — kritisk for `/spectate`, som sender inn sin egen
 * admin-klient for å følge en PÅGÅENDE runde anonymt. Utelates den, faller vi
 * tilbake til den cookie-baserte klienten.
 */
export async function getResultReadClient(
  status: GameStatus,
  fallback?: SupabaseClient<Database>,
): Promise<SupabaseClient<Database>> {
  if (status === 'finished') return getAdminClient();
  return fallback ?? (await getLeaderboardContext()).supabase;
}

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
      // #798: game_players har >1 FK til users → eksplisitt FK-hint kreves
      // (ellers PGRST201 i runtime). Håndhevet av embedAmbiguity.test.ts.
      .from('game_players')
      .select('user_id, result_summary, users!game_players_user_id_fkey(name, nickname)')
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
