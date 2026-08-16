import { describe, it, expect } from 'vitest';
import { shouldShowTeamInvitePointer } from './teamInvitePointer';

describe('shouldShowTeamInvitePointer (#1344)', () => {
  it.each([
    // typeViewKind, hasCertainTeamInvitation → vis peker?
    ['team_form', true, true],
    // Ingen sikkert lag-treff: kapteinen som registrerer eget lag — og den som
    // kun er invitert av arrangøren (#1425) — skal ikke se en peker mot et lag
    // vi ikke vet finnes.
    ['team_form', false, false],
    // Lag-teksten ville vært feil for et spill uten lag-konsept — også når
    // den inviterte faktisk har et sikkert treff ('both' på solo-format).
    ['solo_form', true, false],
    ['solo_form', false, false],
    // Blindveien rendrer aldri lag-skjemaet, så det er ingenting å peke bort fra.
    ['team_unsupported_mode', true, false],
    ['team_unsupported_mode', false, false],
  ] as const)(
    'typeViewKind=%s, hasCertainTeamInvitation=%s → %s',
    (typeViewKind, hasCertainTeamInvitation, expected) => {
      expect(
        shouldShowTeamInvitePointer({ typeViewKind, hasCertainTeamInvitation }),
      ).toBe(expected);
    },
  );
});
