'use server';

import { revalidateTag } from 'next/cache';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { expectAffected } from '@/lib/supabase/affectedRows';
import { requireAdminOrClubAdminOfCup } from '@/lib/admin/auth';
import {
  expandSideAwardConfig,
  isValidSideAward,
  type SideAwardConfigInput,
} from './sideAwardRows';

/**
 * Server actions for cup side-awards (#1441, D9): closest-to-pin / longest-
 * drive-innslag konfigurert i cup-oppsettet, med vinner tastet av arrangøren
 * ETTER runden. Poenget legges på vinnerens LAG i cup-totalen (mapping fra
 * `winner_user_id` til lag skjer i `getCupSnapshot`, ikke her).
 *
 * Egen fil (ikke `lib/cup/actions.ts`): `tournament_side_awards` har INGEN
 * write-RLS-policies (migrasjon 0154, bevisst — kun SELECT for authenticated)
 * — all skriving går via `getAdminClient()` (service-role). Det er et
 * distinkt sikkerhetsmønster (autorisasjon håndheves KUN i denne filens
 * gate, ikke av DB-en) verdt å holde adskilt fra request-klient-mønsteret
 * resten av `lib/cup/actions.ts` bruker (der RLS er backstop).
 */

export type SaveSideAwardConfigError =
  | 'invalid_side_award'
  | 'duplicate_side_award'
  | 'not_found'
  | 'cup_finished'
  | 'cup_started'
  | 'winners_already_registered'
  | 'save_failed';

export type RegisterSideAwardWinnerError = 'not_found' | 'not_a_participant' | 'save_failed';

export type RegisterGirCountsError = 'not_found' | 'invalid_counts' | 'save_failed';

export type SideAwardActionResult<E extends string> = { ok: true } | { ok: false; error: E };

// Full kolonneliste for delete-så-insert-rollbacken (#1489): radene som leses
// FØR slettingen må kunne settes ORDRETT tilbake, inkludert slot- og
// gir-kolonnene fra migrasjon 0156.
const SIDE_AWARD_COLUMNS =
  'id, tournament_id, kind, hole_number, points, winner_user_id, no_winner, slot, gir_max_per_team, gir_team1_count, gir_team2_count';

/**
 * Erstatter cupens fulle sidepoeng-CONFIG (#1441, D9; timing eier-overstyrt i
 * #1455). Timing-regel: konfigurasjon tillatt KUN mens cupen er `draft` —
 * sidepoeng-oppsett hører hjemme i cup-oppsettet. Etter start (`active`/
 * `finished`) er oppsettet låst; da skjer bare vinner-registrering
 * (`registerSideAwardWinner`). Gaten avviser `finished` med `cup_finished` og
 * enhver annen ikke-draft-status med `cup_started`.
 *
 * `winners_already_registered`-sjekken beholdes som forsvar i dybden: etter
 * draft-only-gaten kan den i praksis bare treffe en (teoretisk) draft-cup som
 * likevel har fått en registrert vinner — poenget er å aldri slette et
 * allerede opptjent poeng stille.
 *
 * Atomic-or-compensated (AGENTS.md-felle #5): delete-så-insert, ikke upsert.
 * Kalleren sender den FULLE ønskede lista — et rent upsert kan legge til og
 * oppdatere, men ikke uttrykke at et innslag skal FJERNES (organisatoren kan
 * fjerne en ctp/ld hun la til ved en feil). Gaten over garanterer at radene
 * som slettes uansett bærer `winner_user_id IS NULL`, så en insert-feil
 * ETTER slettingen kompenseres trygt ved å legge de før-slettingen-leste
 * radene rett tilbake — ingen poeng kan gå tapt siden ingen av dem hadde et
 * poeng utdelt.
 */
export async function saveSideAwardConfig(
  tournamentId: string,
  awards: SideAwardConfigInput[],
): Promise<SideAwardActionResult<SaveSideAwardConfigError>> {
  const supabase = await getServerClient();
  await requireAdminOrClubAdminOfCup(supabase, tournamentId);

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

  const admin = getAdminClient();

  const { data: cup } = await admin
    .from('tournaments')
    .select('status, group_id')
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
  if (deleteErr) return { ok: false, error: 'save_failed' };

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
      // Kompensert rollback (AGENTS.md-felle #5): legg de FØR-slettingen-
      // leste radene rett tilbake. Trygt — gaten over garanterte at ingen av
      // dem hadde en registrert vinner eller GIR-teller, så ingenting går
      // tapt.
      if ((existing ?? []).length > 0) {
        await admin.from('tournament_side_awards').insert(
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
      }
      return { ok: false, error: 'save_failed' };
    }
  }

  const groupId = (cup.group_id as string | null) ?? null;
  revalidateTag(`tournament-${tournamentId}`, 'max');
  revalidatePath(`/admin/cup/${tournamentId}`);
  if (groupId) revalidatePath(`/klubber/${groupId}/cup/${tournamentId}`);
  revalidatePath(`/cup/${tournamentId}`);

  return { ok: true };
}

/**
 * Registrerer GIR-tellerne for ETT gir-innslag (#1489): hvor mange GIR hvert
 * lag klarte på hullet, 0..radens `gir_max_per_team`. Poeng = teller ×
 * `points` (utfoldingen skjer i `getCupSnapshot`). Re-registrering er tillatt
 * og overskriver — speiler `registerSideAwardWinner`, ingen status-lås utover
 * authz-gaten.
 */
export async function registerGirCounts(input: {
  tournamentId: string;
  awardId: string;
  team1Count: number;
  team2Count: number;
}): Promise<SideAwardActionResult<RegisterGirCountsError>> {
  const { tournamentId, awardId, team1Count, team2Count } = input;
  const supabase = await getServerClient();
  await requireAdminOrClubAdminOfCup(supabase, tournamentId);

  const admin = getAdminClient();

  const { data: cup } = await admin
    .from('tournaments')
    .select('group_id')
    .eq('id', tournamentId)
    .maybeSingle();
  if (!cup) return { ok: false, error: 'not_found' };

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

  const groupId = (cup.group_id as string | null) ?? null;
  revalidateTag(`tournament-${tournamentId}`, 'max');
  revalidatePath(`/admin/cup/${tournamentId}`);
  if (groupId) revalidatePath(`/klubber/${groupId}/cup/${tournamentId}`);
  revalidatePath(`/cup/${tournamentId}`);

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
export async function registerSideAwardWinner(input: {
  tournamentId: string;
  awardId: string;
  winnerUserId: string | null;
}): Promise<SideAwardActionResult<RegisterSideAwardWinnerError>> {
  const { tournamentId, awardId, winnerUserId } = input;
  const supabase = await getServerClient();
  await requireAdminOrClubAdminOfCup(supabase, tournamentId);

  const admin = getAdminClient();

  const { data: cup } = await admin
    .from('tournaments')
    .select('group_id')
    .eq('id', tournamentId)
    .maybeSingle();
  if (!cup) return { ok: false, error: 'not_found' };

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

  const groupId = (cup.group_id as string | null) ?? null;
  revalidateTag(`tournament-${tournamentId}`, 'max');
  revalidatePath(`/admin/cup/${tournamentId}`);
  if (groupId) revalidatePath(`/klubber/${groupId}/cup/${tournamentId}`);
  revalidatePath(`/cup/${tournamentId}`);

  return { ok: true };
}
