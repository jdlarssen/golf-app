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
    // Avslått/trukket: skjemaet skal tilbake, ikke et banner.
    [{ status: 'rejected', team_request_id: null }, 'none'],
    [{ status: 'withdrawn', team_request_id: 'kaptein-rad-1' }, 'none'],
  ] as [PendingRequestRow | null, string][])('%o → %s', (row, expected) => {
    expect(pendingRequestView(row)).toBe(expected);
  });
});
