import { describe, it, expect } from 'vitest';
import { guestOnlyRoster } from './guestOnlyRoster';

/**
 * #2570: a round where every chosen player is a guest has nobody who can log
 * in and enter scores. The wizard (`useGameFormState`) and the publish actions
 * read this one rule, so they cannot disagree.
 */
describe('guestOnlyRoster (#2570)', () => {
  const guests = new Set(['g1', 'g2', 'g3', 'g4']);

  it.each<[string, Parameters<typeof guestOnlyRoster>[0], ReturnType<typeof guestOnlyRoster>]>([
    [
      'fire gjester, bare inviterte → block',
      { playerIds: ['g1', 'g2', 'g3', 'g4'], guestIds: guests, inviteEmailCount: 0, rosterOptional: false },
      'block',
    ],
    [
      'én gjest, bare inviterte → block',
      { playerIds: ['g1'], guestIds: guests, inviteEmailCount: 0, rosterOptional: false },
      'block',
    ],
    [
      'fire gjester, åpen påmelding → warn (andre kan melde seg på)',
      { playerIds: ['g1', 'g2', 'g3', 'g4'], guestIds: guests, inviteEmailCount: 0, rosterOptional: true },
      'warn',
    ],
    [
      'én registrert spiller blant gjestene → none',
      { playerIds: ['g1', 'g2', 'u1'], guestIds: guests, inviteEmailCount: 0, rosterOptional: false },
      'none',
    ],
    [
      'null valgte → none',
      { playerIds: [], guestIds: guests, inviteEmailCount: 0, rosterOptional: false },
      'none',
    ],
    [
      'gjester pluss en e-postinvitasjon → none (den inviterte får konto)',
      { playerIds: ['g1', 'g2'], guestIds: guests, inviteEmailCount: 1, rosterOptional: false },
      'none',
    ],
    [
      'samme gjest to ganger → block',
      { playerIds: ['g1', 'g1'], guestIds: guests, inviteEmailCount: 0, rosterOptional: false },
      'block',
    ],
    [
      'ingen gjester i det hele tatt → none',
      { playerIds: ['u1', 'u2'], guestIds: new Set(), inviteEmailCount: 0, rosterOptional: false },
      'none',
    ],
  ])('%s', (_label, input, expected) => {
    expect(guestOnlyRoster(input)).toBe(expected);
  });
});
