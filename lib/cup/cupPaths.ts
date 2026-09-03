/**
 * Cup-rutene har to former: frittstående under `/admin/cup/…` og klubb-scopet
 * under `/klubber/[groupId]/cup/…`. Regelen for hvilken som gjelder er ett
 * `group_id`-oppslag — og den bor her, slik at redirect-, revalidate- og
 * lenke-siden aldri kan drifte fra hverandre (AGENTS.md-felle 4).
 *
 * Ren streng-bygging, ingen IO. `groupId` MÅ komme fra gatens admin-lesing
 * (`requireAdminOrClubAdminOfCup`), aldri fra en RLS-lesing: en klubb-cup som
 * request-klienten ikke ser ville lest som `null` og sendt arrangøren inn i
 * admin-chrome — se `cupRedirectBase` i `actions.ts`.
 */
export function cupBasePath(tournamentId: string, groupId: string | null): string {
  return groupId
    ? `/klubber/${groupId}/cup/${tournamentId}`
    : `/admin/cup/${tournamentId}`;
}
