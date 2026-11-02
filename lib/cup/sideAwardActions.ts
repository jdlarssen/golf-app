'use server';

import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdminOrClubAdminOfCup } from '@/lib/admin/auth';
import type { SideAwardConfigInput } from './sideAwardRows';
import {
  registerGirCountsCore,
  registerSideAwardWinnerCore,
  revalidateCupSideAwards,
  saveSideAwardConfigCore,
  type SaveSideAwardConfigError as CoreSaveConfigError,
  type RegisterGirCountsError as CoreGirError,
  type RegisterSideAwardWinnerError as CoreWinnerError,
  type SideAwardActionResult as CoreResult,
} from './sideAwardCore';

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

export type SaveSideAwardConfigError = CoreSaveConfigError;

export type RegisterSideAwardWinnerError = CoreWinnerError;

export type RegisterGirCountsError = CoreGirError;

export type SideAwardActionResult<E extends string> = CoreResult<E>;


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
  // `groupId` kommer fra gaten (#1749): den har allerede lest kolonnen med
  // admin-klienten, så cup-lesingen under trenger bare `status`.
  const { groupId } = await requireAdminOrClubAdminOfCup(supabase, tournamentId);

  const result = await saveSideAwardConfigCore(getAdminClient(), { tournamentId, awards });
  if (!result.ok) return result;

  revalidateCupSideAwards(tournamentId, groupId);

  return { ok: true };
}

/** Registrerer GIR-tellerne for ett innslag. Se `registerGirCountsCore`. */
export async function registerGirCounts(input: {
  tournamentId: string;
  awardId: string;
  team1Count: number;
  team2Count: number;
}): Promise<SideAwardActionResult<RegisterGirCountsError>> {
  const supabase = await getServerClient();
  const { groupId } = await requireAdminOrClubAdminOfCup(supabase, input.tournamentId);
  const result = await registerGirCountsCore(getAdminClient(), input);
  if (result.ok) revalidateCupSideAwards(input.tournamentId, groupId);
  return result;
}

/** Setter vinneren på ett innslag, eller «ingen vinner». Se `registerSideAwardWinnerCore`. */
export async function registerSideAwardWinner(input: {
  tournamentId: string;
  awardId: string;
  winnerUserId: string | null;
}): Promise<SideAwardActionResult<RegisterSideAwardWinnerError>> {
  const supabase = await getServerClient();
  const { groupId } = await requireAdminOrClubAdminOfCup(supabase, input.tournamentId);
  const result = await registerSideAwardWinnerCore(getAdminClient(), input);
  if (result.ok) revalidateCupSideAwards(input.tournamentId, groupId);
  return result;
}
