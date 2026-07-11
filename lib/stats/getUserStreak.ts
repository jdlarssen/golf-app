import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import {
  computeStreak,
  roundStreakGrowth,
  type StreakSummary,
  type StreakGrowth,
} from './streak';

/**
 * Slanke server-oppslag for streak-mekanikken (#1194) på flatene UTENFOR
 * /profile/historikk (som avleder streaken fra data den alt har).
 *
 * «Runde» defineres HELT som på historikk-siden — ferdige spill brukeren deltok
 * i, effektiv dato = `scheduled_tee_off_at ?? ended_at` — så hjem-chippen og
 * historikk-panelet alltid viser SAMME streak. (Bevisst forskjellig fra
 * `admin_key_metrics`, som filtrerer trukne spillere: bruker-flate-konsistens
 * vinner over admin-metrikken, og trukket-men-fullført er en sjelden kant.)
 */

type RoundDateRow = {
  game_id: string;
  games: {
    scheduled_tee_off_at: string | null;
    ended_at: string | null;
  } | null;
};

type DatedRound = { gameId: string; date: Date };

function effectiveRound(row: RoundDateRow): DatedRound | null {
  const iso = row.games?.scheduled_tee_off_at ?? row.games?.ended_at ?? null;
  return iso ? { gameId: row.game_id, date: new Date(iso) } : null;
}

/**
 * Alle brukerens ferdige runder som (spill-id, effektiv dato). Samme filter som
 * historikk-siden: `games.status = 'finished'`, ingen trukket-filter.
 */
async function fetchFinishedRoundDates(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<DatedRound[]> {
  const { data, error } = await supabase
    .from('game_players')
    .select('game_id, games!inner(scheduled_tee_off_at, ended_at)')
    .eq('user_id', userId)
    .eq('games.status', 'finished')
    .returns<RoundDateRow[]>();
  if (error) throw error;
  return (data ?? [])
    .map(effectiveRound)
    .filter((r): r is DatedRound => r != null);
}

/** Brukerens streak-tilstand for hjem-chippen. */
export async function getUserStreak(
  supabase: SupabaseClient<Database>,
  userId: string,
  now: Date = new Date(),
): Promise<StreakSummary> {
  const rounds = await fetchFinishedRoundDates(supabase, userId);
  return computeStreak({ dates: rounds.map((r) => r.date), now });
}

/**
 * Om en nettopp avsluttet runde fikk streaken til å vokse — for etter-runde-
 * feiringen. Sammenligner streaken med og uten nettopp dette spillet. Finner ikke
 * spillet blant brukerens ferdige runder (f.eks. trukket), er svaret «ingen vekst».
 */
export async function getRoundStreakGrowth(
  supabase: SupabaseClient<Database>,
  userId: string,
  gameId: string,
  now: Date = new Date(),
): Promise<StreakGrowth> {
  const rounds = await fetchFinishedRoundDates(supabase, userId);
  const thisRound = rounds.find((r) => r.gameId === gameId);
  if (!thisRound) {
    return { grew: false, weeklyStreak: 0, weeklyStreakActive: false };
  }
  const datesWithout = rounds
    .filter((r) => r.gameId !== gameId)
    .map((r) => r.date);
  return roundStreakGrowth({ datesWithout, newDate: thisRound.date, now });
}
