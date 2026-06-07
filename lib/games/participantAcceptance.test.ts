import { describe, it, expect } from 'vitest';
import { acceptedAtForActor } from './participantAcceptance';

// #463: single source of truth for accepted_at på en ny game_players/
// league_players-rad. Self (legger til seg selv) → bekreftet nå; arrangør
// legger til en annen → null (pending, «Ikke bekreftet»).
describe('acceptedAtForActor', () => {
  const now = '2026-06-07T10:00:00.000Z';

  it('self (acting === row) → bekreftet med now()', () => {
    expect(acceptedAtForActor('u1', 'u1', now)).toBe(now);
  });

  it('arrangør legger til en annen (acting !== row) → null (pending)', () => {
    expect(acceptedAtForActor('u1', 'u2', now)).toBeNull();
  });

  it('bruker injisert now-verdi i stedet for å lese klokka', () => {
    expect(acceptedAtForActor('x', 'x', '2020-01-01T00:00:00.000Z')).toBe(
      '2020-01-01T00:00:00.000Z',
    );
  });
});
