'use server';

import { revalidateTag } from 'next/cache';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { expectAffected } from '@/lib/supabase/affectedRows';
import { requireAdminOrClubAdminOfCup } from '@/lib/admin/auth';

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

export type SideAwardConfigInput = {
  kind: 'ctp' | 'ld';
  holeNumber: number;
  points: number;
};

export type SaveSideAwardConfigError =
  | 'invalid_side_award'
  | 'duplicate_side_award'
  | 'not_found'
  | 'cup_finished'
  | 'winners_already_registered'
  | 'save_failed';

export type RegisterSideAwardWinnerError = 'not_found' | 'not_a_participant' | 'save_failed';

export type SideAwardActionResult<E extends string> = { ok: true } | { ok: false; error: E };

function isValidSideAward(a: SideAwardConfigInput): boolean {
  return (
    (a.kind === 'ctp' || a.kind === 'ld') &&
    Number.isInteger(a.holeNumber) &&
    a.holeNumber >= 1 &&
    a.holeNumber <= 18 &&
    typeof a.points === 'number' &&
    Number.isFinite(a.points) &&
    a.points > 0
  );
}

/**
 * Erstatter cupens fulle sidepoeng-CONFIG (#1441, D9). Timing-regel valgt for
 * denne fasen: tillatt mens cupen er `draft`, ELLER `active` SÅ LENGE ingen
 * av cupens eksisterende innslag har en registrert vinner ennå («active men
 * vinner-løs»). Rasjonale: konfigurasjon hører hjemme i cup-oppsettet (draft,
 * eller tidlig i active før arrangøren har rukket å taste noe) —
 * vinner-registrering skjer ETTER runden er spilt
 * (`registerSideAwardWinner`). Å tillate re-konfigurering etter at en vinner
 * er tastet ville stille slette allerede opptjente poeng, så det avvises
 * (`winners_already_registered`) i stedet for å skje stille.
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
  // #1441 (D9 unique-semantikk, migrasjon 0154: unique(tournament_id, kind,
  // hole_number)): avvis duplikater i SAMME innsending før noe skrives —
  // ellers feiler inserten sent på en DB-constraint i stedet for tidlig med
  // en meningsfull feilkode.
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

  const { data: existing, error: existingErr } = await admin
    .from('tournament_side_awards')
    .select('id, tournament_id, kind, hole_number, points, winner_user_id')
    .eq('tournament_id', tournamentId);
  if (existingErr) return { ok: false, error: 'save_failed' };

  const hasRegisteredWinner = (existing ?? []).some((a) => a.winner_user_id !== null);
  if (hasRegisteredWinner) return { ok: false, error: 'winners_already_registered' };

  const { error: deleteErr } = await admin
    .from('tournament_side_awards')
    .delete()
    .eq('tournament_id', tournamentId);
  if (deleteErr) return { ok: false, error: 'save_failed' };

  if (awards.length > 0) {
    const { error: insertErr } = await admin.from('tournament_side_awards').insert(
      awards.map((a) => ({
        tournament_id: tournamentId,
        kind: a.kind,
        hole_number: a.holeNumber,
        points: a.points,
      })),
    );
    if (insertErr) {
      // Kompensert rollback (AGENTS.md-felle #5): legg de FØR-slettingen-
      // leste radene rett tilbake. Trygt — gaten over garanterte at ingen av
      // dem hadde en registrert vinner, så ingenting går tapt.
      if ((existing ?? []).length > 0) {
        await admin.from('tournament_side_awards').insert(
          (existing ?? []).map((a) => ({
            id: a.id,
            tournament_id: a.tournament_id,
            kind: a.kind,
            hole_number: a.hole_number,
            points: a.points,
            winner_user_id: a.winner_user_id,
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
 * Setter `winner_user_id` på ETT sidepoeng-innslag (#1441, D9). Vinneren må
 * være en deltaker i cupen — validert mot rosteret via `game_players`-radene
 * for cupens matcher — slik at arrangøren ikke ved en feiltastet id kan gi
 * poeng til en spiller som ikke er med i runden.
 */
export async function registerSideAwardWinner(input: {
  tournamentId: string;
  awardId: string;
  winnerUserId: string;
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

  // Roster-validering: vinneren må være game_players på en av cupens matcher
  // (samme rosterdefinisjon som getCupSnapshot bruker for team1/team2-mapping).
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

  try {
    expectAffected(
      await admin
        .from('tournament_side_awards')
        .update({ winner_user_id: winnerUserId })
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
