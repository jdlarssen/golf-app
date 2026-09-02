import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { expectAffected } from '@/lib/supabase/affectedRows';
import {
  DEFAULT_TIE_POINTS,
  DEFAULT_WIN_POINTS,
  derivePointsToWinWeighted,
  resolveCupMatchTotal,
} from './pointsToWin';

/**
 * Holder `tournaments.points_to_win` i takt med kampene (#1902).
 *
 * Målet ble satt én gang, ved start, og aldri rørt igjen. Kaptein-uttaket
 * (#1884) avdekker nye kamper mens cupen er aktiv, og arrangøren kan rette
 * planlagt antall når som helst — begge deler skal flytte målet. Denne
 * helperen er det ene stedet den omregningen skjer, så de tre skrivepunktene
 * (`startTournament`, `setCupPlannedMatchCount`, `revealCupLineupSession`)
 * ikke kan drive fra hverandre (AGENTS.md-felle 4).
 *
 * Skriver KUN når cupen er aktiv:
 *  - `draft` beholder NULL — målet utledes ved start (#1142), ikke før.
 *  - `finished` røres aldri; da er vinneren kåret og tallet er historie.
 *
 * Idempotent: samme input gir samme verdi, så den kan kalles så ofte man vil.
 * To samtidige avdekkinger regner begge fra dagens `count` og skriver samme
 * tall — siste skriv vinner harmløst.
 *
 * Kaster ved lesefeil eller 0-rads skriving (`expectAffected`) — kalleren
 * avgjør om det skal velte handlingen eller bare logges. Egen fil framfor en
 * funksjon i `lineupActions.ts`, som er `'use server'`: der er kun async
 * exports lov, og denne skal kunne importeres av `actions.ts` òg.
 */
export async function syncCupPointsToWin(
  admin: SupabaseClient<Database>,
  tournamentId: string,
): Promise<void> {
  const [{ data: cup, error: cupError }, { count, error: gamesError }] =
    await Promise.all([
      admin
        .from('tournaments')
        .select('status, planned_match_count, win_points, tie_points')
        .eq('id', tournamentId)
        .maybeSingle(),
      admin
        .from('games')
        .select('id', { head: true, count: 'exact' })
        .eq('tournament_id', tournamentId),
    ]);

  // «Ingen feil» er ikke det samme som «data» (I3): en defaultet lesefeil
  // ville blitt til «0 kamper» og senket målet til 0,5.
  if (cupError) throw new Error(`syncCupPointsToWin: ${cupError.message}`);
  if (gamesError) throw new Error(`syncCupPointsToWin: ${gamesError.message}`);
  if (!cup) throw new Error('syncCupPointsToWin: cup not found');

  // Draft og finished: ingen skriving. Ikke en feil — den vanlige tilstanden
  // når arrangøren lagrer planlagt antall før cupen har startet.
  if (cup.status !== 'active') return;

  const pointsToWin = derivePointsToWinWeighted(
    resolveCupMatchTotal(
      count ?? 0,
      (cup.planned_match_count as number | null) ?? null,
    ),
    (cup.win_points as number | null) ?? DEFAULT_WIN_POINTS,
    (cup.tie_points as number | null) ?? DEFAULT_TIE_POINTS,
  );

  expectAffected(
    await admin
      .from('tournaments')
      .update({ points_to_win: pointsToWin })
      .eq('id', tournamentId)
      .select('id'),
    'syncCupPointsToWin',
  );
}
