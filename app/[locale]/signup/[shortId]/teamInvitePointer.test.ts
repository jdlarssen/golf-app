import { describe, it, expect } from 'vitest';
import { shouldShowTeamInvitePointer } from './teamInvitePointer';

describe('shouldShowTeamInvitePointer (#1344)', () => {
  it.each([
    // typeViewKind, hasPendingInvitation → vis peker?
    ['team_form', true, true],
    // Ingen ventende invitasjon: kapteinen som registrerer eget lag skal ikke
    // se en peker mot et lag hen ikke er invitert til.
    ['team_form', false, false],
    // Lag-teksten ville vært feil for et spill uten lag-konsept — også når
    // den inviterte faktisk har en ventende rad ('both' på solo-format).
    ['solo_form', true, false],
    ['solo_form', false, false],
    // Blindveien rendrer aldri lag-skjemaet, så det er ingenting å peke bort fra.
    ['team_unsupported_mode', true, false],
    ['team_unsupported_mode', false, false],
  ] as const)(
    'typeViewKind=%s, hasPendingInvitation=%s → %s',
    (typeViewKind, hasPendingInvitation, expected) => {
      expect(
        shouldShowTeamInvitePointer({ typeViewKind, hasPendingInvitation }),
      ).toBe(expected);
    },
  );
});
