import type { Database } from '@/lib/database.types';

type RequestStatus = Database['public']['Enums']['registration_request_status'];

/** Minimum en request-rad må bære for at visningen skal kunne avgjøres. */
export type PendingRequestRow = {
  status: RequestStatus;
  team_request_id: string | null;
  /**
   * Status på kapteinens rad når dette er en child-rad (#2061). Hentes bare
   * for en godkjent child-rad uten `game_players`-rad; ellers utelatt.
   */
  captain_status?: RequestStatus | null;
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
 *  - `team_awaiting_approval` (#2061): du har sagt ja til laget, men
 *    arrangøren har ikke godkjent kapteinen ennå. Raden din er `approved`,
 *    men du står ikke på spillerlista før laget godkjennes — samme situasjon
 *    for deg som en sendt forespørsel.
 *
 * Ren beslutnings-logikk (Type-A-testbar) skilt ut av `page.tsx`-`renderBody`
 * etter samme mønster som `registrationTypeView.ts` — `renderBody` er
 * ueksportert, så dette er eneste vei til en unit-test.
 *
 * Utenom `team_awaiting_approval` gir kun `pending` en visning: andre
 * approved-rader har en `game_players`-rad (som fanges av allerede-påmeldt-
 * grenen over) eller er fjernet av arrangøren, og rejected/withdrawn skal
 * falle gjennom til påmeldings-skjemaet igjen.
 */
export type PendingRequestView =
  | 'none'
  | 'self_request'
  | 'captain_invited'
  | 'team_awaiting_approval';

export function pendingRequestView(
  row: PendingRequestRow | null | undefined,
): PendingRequestView {
  if (row == null) return 'none';
  if (row.status === 'approved') {
    return row.team_request_id != null && row.captain_status === 'pending'
      ? 'team_awaiting_approval'
      : 'none';
  }
  if (row.status !== 'pending') return 'none';
  return row.team_request_id != null ? 'captain_invited' : 'self_request';
}
