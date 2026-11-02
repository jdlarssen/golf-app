import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { expireTournamentCache } from '@/lib/games/expireGameCache';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { expectAffected } from '@/lib/supabase/affectedRows';
import { syncFinishedCupWinner } from './finishedCupWinner';
import { expandSideAwardConfig, isValidSideAward, type SideAwardConfigInput } from './sideAwardRows';

/**
 * Registreringen av sidepoeng, delt av nettets `sideAwardActions.ts` og appens ruter
 * (#2752). Kjernen leser ingen cookie: kalleren har gjort gaten. Tabellen har ingen
 * skrive-policy (0154), så den gaten ER håndhevelsen (AGENTS.md trap 3).
 */

export type RegisterSideAwardWinnerError = 'not_found' | 'not_a_participant' | 'save_failed';

export type RegisterGirCountsError = 'not_found' | 'invalid_counts' | 'save_failed';

export type SideAwardActionResult<E extends string> = { ok: true } | { ok: false; error: E };

export type SaveSideAwardConfigError =
  | 'invalid_side_award'
  | 'duplicate_side_award'
  | 'not_found'
  | 'cup_finished'
  | 'cup_started'
  | 'winners_already_registered'
  | 'save_failed';

// Full kolonneliste for delete-så-insert-rollbacken (#1489): radene som leses
// FØR slettingen må kunne settes ORDRETT tilbake, inkludert slot- og
// gir-kolonnene fra migrasjon 0156.
const SIDE_AWARD_COLUMNS =
  'id, tournament_id, kind, hole_number, points, winner_user_id, no_winner, slot, gir_max_per_team, gir_team1_count, gir_team2_count';

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

/**
 * Oppsettet av sidepoeng: bare mens cupen er utkast (#1455). Kalleren sender den FULLE
 * ønskede lista, så det er delete-så-insert, og en insert-feil kompenseres ved å legge
 * de leste radene rett tilbake (AGENTS.md felle 5). Det er trygt, for gaten under
 * garanterer at ingen av dem har et registrert svar.
 */
export async function saveSideAwardConfigCore(
  admin: SupabaseClient<Database>,
  input: { tournamentId: string; awards: SideAwardConfigInput[] },
): Promise<SideAwardActionResult<SaveSideAwardConfigError>> {
  const { tournamentId, awards } = input;

  if (!awards.every(isValidSideAward)) {
    return { ok: false, error: 'invalid_side_award' };
  }
  // Én CONFIG-rad per (kind, hull) — flere vinner-plasser uttrykkes via
  // `winnerCount` på raden (#1489), ikke via duplikat-rader. Avvis duplikater
  // i SAMME innsending før noe skrives — ellers feiler inserten sent på
  // DB-unique-en (nå (tournament_id, kind, hole_number, slot), 0156) i stedet
  // for tidlig med en meningsfull feilkode.
  const seen = new Set<string>();
  for (const a of awards) {
    const key = `${a.kind}#${a.holeNumber}`;
    if (seen.has(key)) return { ok: false, error: 'duplicate_side_award' };
    seen.add(key);
  }

  const { data: cup } = await admin
    .from('tournaments')
    .select('status')
    .eq('id', tournamentId)
    .maybeSingle();
  if (!cup) return { ok: false, error: 'not_found' };
  if (cup.status === 'finished') return { ok: false, error: 'cup_finished' };
  // #1455 (eier-overstyring av D9): sidepoeng-oppsett hører hjemme i
  // cup-oppsettet — konfigurasjon KUN mens cupen er `draft`. Etter start er
  // det låst (kun vinner-registrering). Rekkefølgen finished → started gir mest
  // spesifikk melding: en avsluttet cup får fortsatt `cup_finished`.
  if (cup.status !== 'draft') return { ok: false, error: 'cup_started' };

  const { data: existing, error: existingErr } = await admin
    .from('tournament_side_awards')
    .select(SIDE_AWARD_COLUMNS)
    .eq('tournament_id', tournamentId);
  if (existingErr) return { ok: false, error: 'save_failed' };

  // «Registrert» = en tastet vinner, et tastet «ingen vinner» (#1530) ELLER en
  // tastet GIR-teller (#1489) — alle er ferdige svar fra arrangøren som aldri
  // skal slettes stille av en re-konfig. «Ingen vinner» gir riktignok 0 poeng,
  // men det er like fullt et svar hun har tastet; samme resonnement som
  // GIR-telleren 0.
  const hasRegisteredWinner = (existing ?? []).some(
    (a) =>
      a.winner_user_id !== null ||
      a.no_winner === true ||
      a.gir_team1_count !== null ||
      a.gir_team2_count !== null,
  );
  if (hasRegisteredWinner) return { ok: false, error: 'winners_already_registered' };

  const { error: deleteErr } = await admin
    .from('tournament_side_awards')
    .delete()
    .eq('tournament_id', tournamentId);
  if (deleteErr) {
    console.error('[cup] saveSideAwardConfig delete failed', { tournamentId, error: deleteErr });
    return { ok: false, error: 'save_failed' };
  }

  if (awards.length > 0) {
    // Ekspansjon (#1489): ctp/ld-rad med winnerCount N → N DB-rader slot 1..N;
    // gir-rad → én DB-rad (slot 1) med gir_max_per_team. Ren logikk i
    // sideAwardRows.ts.
    const { error: insertErr } = await admin.from('tournament_side_awards').insert(
      expandSideAwardConfig(awards).map((row) => ({
        tournament_id: tournamentId,
        ...row,
      })),
    );
    if (insertErr) {
      console.error('[cup] saveSideAwardConfig insert failed', { tournamentId, error: insertErr });
      // Kompensert rollback (AGENTS.md-felle #5): legg de FØR-slettingen-
      // leste radene rett tilbake. Trygt — gaten over garanterte at ingen av
      // dem hadde en registrert vinner eller GIR-teller, så ingenting går
      // tapt. #2223: a failed re-insert leaves the cup without its side
      // awards, so its error is logged.
      if ((existing ?? []).length > 0) {
        const { error: restoreErr } = await admin.from('tournament_side_awards').insert(
          (existing ?? []).map((a) => ({
            id: a.id,
            tournament_id: a.tournament_id,
            kind: a.kind,
            hole_number: a.hole_number,
            points: a.points,
            winner_user_id: a.winner_user_id,
            no_winner: a.no_winner,
            slot: a.slot,
            gir_max_per_team: a.gir_max_per_team,
            gir_team1_count: a.gir_team1_count,
            gir_team2_count: a.gir_team2_count,
          })),
        );
        if (restoreErr) {
          console.error('[cup] saveSideAwardConfig restore failed', {
            tournamentId,
            error: restoreErr,
          });
        }
      }
      return { ok: false, error: 'save_failed' };
    }
  }

  return { ok: true };
}
