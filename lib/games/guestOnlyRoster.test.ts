import { describe, it, expect } from 'vitest';
import { guestOnlyRoster } from './guestOnlyRoster';

/**
 * #2570: a round where every chosen player is a guest has nobody who can log
 * in and enter scores. The owner's choice (C): it stops, whatever the signup
 * mode. The wizard (`useGameFormState`) and the publish actions read this one
 * rule, so they cannot disagree.
 */
describe('guestOnlyRoster (#2570)', () => {
  const guests = new Set(['g1', 'g2', 'g3', 'g4']);

  it.each<[string, Parameters<typeof guestOnlyRoster>[0], ReturnType<typeof guestOnlyRoster>]>([
    ['fire gjester → block', { playerIds: ['g1', 'g2', 'g3', 'g4'], guestIds: guests, inviteEmailCount: 0 }, 'block'],
    ['én gjest → block', { playerIds: ['g1'], guestIds: guests, inviteEmailCount: 0 }, 'block'],
    ['én registrert spiller blant gjestene → none', { playerIds: ['g1', 'g2', 'u1'], guestIds: guests, inviteEmailCount: 0 }, 'none'],
    ['null valgte → none', { playerIds: [], guestIds: guests, inviteEmailCount: 0 }, 'none'],
    [
      'gjester pluss en e-postinvitasjon → none (den inviterte får konto)',
      { playerIds: ['g1', 'g2'], guestIds: guests, inviteEmailCount: 1 },
      'none',
    ],
    ['samme gjest to ganger → block', { playerIds: ['g1', 'g1'], guestIds: guests, inviteEmailCount: 0 }, 'block'],
    ['ingen gjester i det hele tatt → none', { playerIds: ['u1', 'u2'], guestIds: new Set(), inviteEmailCount: 0 }, 'none'],
  ])('%s', (_label, input, expected) => {
    expect(guestOnlyRoster(input)).toBe(expected);
  });
});
