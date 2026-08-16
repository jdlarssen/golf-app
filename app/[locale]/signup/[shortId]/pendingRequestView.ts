import type { Database } from '@/lib/database.types';

type RequestStatus = Database['public']['Enums']['registration_request_status'];

/** Minimum en request-rad må bære for at visningen skal kunne avgjøres. */
export type PendingRequestRow = {
  status: RequestStatus;
  team_request_id: string | null;
};

/**
 * Hva base-signup-siden skal vise når brukeren har en åpen request-rad.
 *
 * `game_registration_requests` bærer to helt ulike situasjoner i samme
 * `pending`-status, og siden behandlet dem likt (#1422):
 *  - `self_request`: du har selv bedt om plass, og arrangøren har ikke svart.
 *    «Forespørsel sendt» er riktig — det finnes ingenting mer å gjøre.
 *  - `captain_invited`: en kaptein har satt deg på laget sitt, og raden er en
 *    child-rad (`team_request_id` peker på kapteinens rad, se
 *    `teamActions.ts`). Da ligger svaret ditt — ja eller nei — på lag-siden,
 *    og «Forespørsel sendt» var en blindvei uten vei videre.
 *
 * Ren beslutnings-logikk (Type-A-testbar) skilt ut av `page.tsx`-`renderBody`
 * etter samme mønster som `registrationTypeView.ts` — `renderBody` er
 * ueksportert, så dette er eneste vei til en unit-test.
 *
 * Kun `pending` gir en visning: approved-rader har allerede en
 * `game_players`-rad (som fanges av allerede-påmeldt-grenen over), og
 * rejected/withdrawn skal falle gjennom til påmeldings-skjemaet igjen.
 */
export type PendingRequestView = 'none' | 'self_request' | 'captain_invited';

export function pendingRequestView(
  row: PendingRequestRow | null | undefined,
): PendingRequestView {
  if (row == null || row.status !== 'pending') return 'none';
  return row.team_request_id != null ? 'captain_invited' : 'self_request';
}
