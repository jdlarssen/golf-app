'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrClubAdminOfCup } from '@/lib/admin/auth';
import { generateCupMatchesCore, revalidateCupGenerated } from '@/lib/cup/generateMatchesCore';
import type { CupBatchError, CupBatchMatch } from '@/lib/cup/insertCupMatches';

/**
 * Batch-opprettelse av cup-matcher fra en generert plan (#219, fase 4; #1441
 * F3b: splittet-cup-dag-bunten).
 *
 * Denne fila eier gaten og redirecten. Veiviserens regler (tak-vaktene og lesingen
 * av den lagrede planen) bor i `lib/cup/generateMatchesCore` fra #2752, som appens
 * rute også kaller. Selve skrivingen — profil-oppslag, mode_config, to-pass-inserten
 * og rollbacken — bor i `lib/cup/insertCupMatches` fra #1884, fordi kaptein-uttakets
 * avdekking setter inn nøyaktig samme slags matcher og skal dele kjernen framfor å
 * kopiere den.
 *
 * `'use server'`-moduler kan ikke eksportere rene helpere, så det delte hjemmet
 * måtte uansett ligge utenfor denne fila — samme grunn som `cupMatchAllowance`
 * (#1539/#1551) og `ALLOWANCE_DEFAULTS` (#809) allerede bor i lib/cup.
 */

/**
 * #1472: input-typen bærer KUN det klienten faktisk eier — cupens id og den
 * fordelte match-planen (side1/side2/segment/sourceId + greensomens
 * `teamStrokesOverride`). Bane/tee/tee-off/best-ball leses server-side fra den
 * lagrede planen (`tournament_plans`, Oppsett-rommet) i stedet for å komme som
 * klient-payload — mindre manipulasjonsflate, og serveren er fasit ved submit.
 */
export type CupBatchInput = {
  tournamentId: string;
  matches: CupBatchMatch[];
};

/**
 * Returnerer `{ error }` ved validerings-/DB-feil. Ved suksess redirecter den
 * til cup-detalj-siden (kaster NEXT_REDIRECT — kall-siden navigerer videre).
 */
export async function createCupMatchesFromPlan(
  input: CupBatchInput,
): Promise<CupBatchError> {
  const { tournamentId, matches } = input;

  const supabase = await getServerClient();
  // #524/#526: klubb-cup styres av klubb-admin (eller global admin); personlig
  // cup av skaperen (eller global admin). Gaten slår opp cupens group_id; RLS
  // (0089 + 0090) er backstop. isAdmin styrer cap-bypass i kjernen.
  const { userId, isAdmin } = await requireAdminOrClubAdminOfCup(
    supabase,
    tournamentId,
  );

  const outcome = await generateCupMatchesCore(supabase, { tournamentId, userId, isAdmin, matches });
  if ('error' in outcome) return outcome;
  const { groupId } = outcome;

  revalidateCupGenerated(tournamentId, groupId);
  const locale = await getLocale();
  redirect({
    href: groupId
      ? `/klubber/${groupId}/cup/${tournamentId}?status=matches_generated`
      : `/admin/cup/${tournamentId}?status=matches_generated`,
    locale,
  });
}
