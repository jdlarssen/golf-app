import { describe, it, expect } from 'vitest';
import { pendingRequestView, type PendingRequestRow } from './pendingRequestView';

/**
 * Type A — ren utvalgs-logikk for hvilken av de to `pending`-situasjonene en
 * request-rad er (#1422). En kaptein-opprettet child-rad bærer
 * `team_request_id`; en selv-sendt forespørsel gjør det ikke.
 */
describe('pendingRequestView (#1422)', () => {
  it.each([
    // rad → visning
    [null, 'none'],
    [{ status: 'pending', team_request_id: null }, 'self_request'],
    [{ status: 'pending', team_request_id: 'kaptein-rad-1' }, 'captain_invited'],
    // Godkjent lag-rad: brukeren er allerede med, og allerede-påmeldt-grenen
    // over eier den visningen.
    [{ status: 'approved', team_request_id: 'kaptein-rad-1' }, 'none'],
    // #2061: sagt ja til laget, men arrangøren har ikke godkjent kapteinen —
    // ingen spillerrad ennå, så siden viser at du venter på arrangøren.
    [
      { status: 'approved', team_request_id: 'kaptein-rad-1', captain_status: 'pending' },
      'team_awaiting_approval',
    ],
    // Kapteinen er godkjent (eller borte), men du har ingen spillerrad —
    // f.eks. fjernet av arrangøren: skjemaet, ikke et vente-banner.
    [
      { status: 'approved', team_request_id: 'kaptein-rad-1', captain_status: 'approved' },
      'none',
    ],
    [{ status: 'approved', team_request_id: 'kaptein-rad-1', captain_status: null }, 'none'],
    [{ status: 'approved', team_request_id: null, captain_status: 'pending' }, 'none'],
    // Avslått/trukket: skjemaet skal tilbake, ikke et banner.
    [{ status: 'rejected', team_request_id: null }, 'none'],
    [{ status: 'withdrawn', team_request_id: 'kaptein-rad-1' }, 'none'],
  ] as [PendingRequestRow | null, string][])('%o → %s', (row, expected) => {
    expect(pendingRequestView(row)).toBe(expected);
  });
});
