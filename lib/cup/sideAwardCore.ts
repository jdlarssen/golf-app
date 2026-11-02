import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { expireTournamentCache } from '@/lib/games/expireGameCache';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { expectAffected } from '@/lib/supabase/affectedRows';
import { syncFinishedCupWinner } from './finishedCupWinner';

/**
 * Registreringen av sidepoeng, delt av nettets `sideAwardActions.ts` og appens ruter
 * (#2752). Kjernen leser ingen cookie: kalleren har gjort gaten. Tabellen har ingen
 * skrive-policy (0154), så den gaten ER håndhevelsen (AGENTS.md trap 3).
 */

export type RegisterSideAwardWinnerError = 'not_found' | 'not_a_participant' | 'save_failed';

export type RegisterGirCountsError = 'not_found' | 'invalid_counts' | 'save_failed';

export type SideAwardActionResult<E extends string> = { ok: true } | { ok: false; error: E };

/** Buster det en registrering kan ha endret. */
export function revalidateCupSideAwards(tournamentId: string, groupId: string | null): void {
  expireTournamentCache(tournamentId);
  revalidatePath(`/admin/cup/${tournamentId}`);
  if (groupId) revalidatePath(`/klubber/${groupId}/cup/${tournamentId}`);
  revalidatePath(`/cup/${tournamentId}`);
}

/**
 * Registrerer GIR-tellerne for ETT gir-innslag (#1489): hvor mange GIR hvert
 * lag klarte på hullet, 0..radens `gir_max_per_team`. Poeng = teller ×
 * `points` (utfoldingen skjer i `getCupSnapshot`). Re-registrering er tillatt
 * og overskriver — speiler `registerSideAwardWinner`, ingen status-lås utover
 * authz-gaten. I en avsluttet cup regnes vinneren på nytt etterpå (#2214).
 */
export async function registerGirCountsCore(
  admin: SupabaseClient<Database>,
  input: { tournamentId: string; awardId: string; team1Count: number; team2Count: number },
): Promise<SideAwardActionResult<RegisterGirCountsError>> {
  const { tournamentId, awardId, team1Count, team2Count } = input;

  const { data: award } = await admin
    .from('tournament_side_awards')
    .select('id, kind, gir_max_per_team')
    .eq('id', awardId)
    .eq('tournament_id', tournamentId)
    .maybeSingle();
  if (!award || award.kind !== 'gir') return { ok: false, error: 'not_found' };

  // DB-CHECK-en (0156) håndhever det samme — valider her for en meningsfull
  // feilkode i stedet for en sen constraint-feil.
  const max = award.gir_max_per_team ?? 1;
  const validCount = (n: number) => Number.isInteger(n) && n >= 0 && n <= max;
  if (!validCount(team1Count) || !validCount(team2Count)) {
    return { ok: false, error: 'invalid_counts' };
  }

  try {
    expectAffected(
      await admin
        .from('tournament_side_awards')
        .update({ gir_team1_count: team1Count, gir_team2_count: team2Count })
        .eq('id', awardId)
        .eq('tournament_id', tournamentId)
        .select('id'),
      'registerGirCounts',
    );
  } catch (err) {
    console.error('[cup] registerGirCounts failed', { tournamentId, awardId, err });
    return { ok: false, error: 'save_failed' };
  }

  // #2214: in a finished cup the winner follows the corrected points.
  try {
    await syncFinishedCupWinner(tournamentId);
  } catch (err) {
    console.error('[cup] registerGirCounts winner sync failed', { tournamentId, awardId, err });
    return { ok: false, error: 'save_failed' };
  }

  return { ok: true };
}

/**
 * Setter `winner_user_id` på ETT sidepoeng-innslag (#1441, D9) — med flere
 * vinner-plasser (#1489) er «ett innslag» én slot-rad, så flyten er uendret.
 * Vinneren må være en deltaker i cupen — validert mot rosteret via
 * `game_players`-radene for cupens matcher — slik at arrangøren ikke ved en
 * feiltastet id kan gi poeng til en spiller som ikke er med i runden.
 * GIR-rader har ingen vinner (lag-tellere via `registerGirCounts`) og avvises
 * med `not_found` — for kalleren finnes det ingen vinner-registrerbar rad med
 * den id-en.
 *
 * `winnerUserId: null` = «ingen vinner» (#1530): ingen kvalifiserte på hullet.
 * Da settes `no_winner` i stedet, og roster-valideringen hoppes over — det
 * finnes ingen spiller å validere. Innslaget teller som ferdig registrert
 * (`isSideAwardRegistered`) og gir 0 poeng til begge lag.
 *
 * De to tilstandene er gjensidig utelukkende, og BEGGE grenene skriver begge
 * kolonnene: retter arrangøren «ingen vinner» tilbake til en spiller, må
 * `no_winner` nullstilles i samme update — ellers ville raden bære begge
 * tilstandene og DB-CHECK-en (migrasjon 0157) avvise skrivingen.
 */
export async function registerSideAwardWinnerCore(
  admin: SupabaseClient<Database>,
  input: { tournamentId: string; awardId: string; winnerUserId: string | null },
): Promise<SideAwardActionResult<RegisterSideAwardWinnerError>> {
  const { tournamentId, awardId, winnerUserId } = input;

  const { data: award } = await admin
    .from('tournament_side_awards')
    .select('id, kind')
    .eq('id', awardId)
    .eq('tournament_id', tournamentId)
    .maybeSingle();
  if (!award || award.kind === 'gir') return { ok: false, error: 'not_found' };

  // Roster-validering: vinneren må være game_players på en av cupens matcher
  // (samme rosterdefinisjon som getCupSnapshot bruker for team1/team2-mapping).
  // Hoppes over for «ingen vinner» (#1530) — det finnes ingen spiller å
  // validere, og en cup uten genererte matcher skal fortsatt kunne svare
  // «ingen» på et innslag.
  if (winnerUserId !== null) {
    const { data: gameRows } = await admin
      .from('games')
      .select('id')
      .eq('tournament_id', tournamentId);
    const gameIds = (gameRows ?? []).map((g) => g.id as string);
    if (gameIds.length === 0) return { ok: false, error: 'not_a_participant' };

    const { data: playerRows } = await admin
      .from('game_players')
      .select('user_id')
      .in('game_id', gameIds)
      .eq('user_id', winnerUserId);
    if (!playerRows || playerRows.length === 0) {
      return { ok: false, error: 'not_a_participant' };
    }
  }

  try {
    expectAffected(
      await admin
        .from('tournament_side_awards')
        .update({ winner_user_id: winnerUserId, no_winner: winnerUserId === null })
        .eq('id', awardId)
        .eq('tournament_id', tournamentId)
        .select('id'),
      'registerSideAwardWinner',
    );
  } catch (err) {
    console.error('[cup] registerSideAwardWinner failed', { tournamentId, awardId, err });
    return { ok: false, error: 'save_failed' };
  }

  // #2214: in a finished cup the winner follows the corrected points.
  try {
    await syncFinishedCupWinner(tournamentId);
  } catch (err) {
    console.error('[cup] registerSideAwardWinner winner sync failed', {
      tournamentId,
      awardId,
      err,
    });
    return { ok: false, error: 'save_failed' };
  }

  return { ok: true };
}
