import { describe, it, expect } from 'vitest';
import { resolveRegistrationTypeView } from './registrationTypeView';

describe('resolveRegistrationTypeView (#466)', () => {
  it.each([
    // registration_type, modeSupportsTeams → forventet view-kind
    ['solo', true, 'solo_form'],
    ['solo', false, 'solo_form'],
    ['team', true, 'team_form'],
    ['team', false, 'team_unsupported_mode'],
    ['both', true, 'team_form'],
    // #466: 'both' tillater eksplisitt solo. En solo-format med 'both' skal
    // falle til solo-formen, IKKE den gamle blindvei-advarselen.
    ['both', false, 'solo_form'],
  ] as const)(
    'registration_type=%s, modeSupportsTeams=%s → %s',
    (registrationType, modeSupportsTeams, expected) => {
      expect(
        resolveRegistrationTypeView(registrationType, modeSupportsTeams).kind,
      ).toBe(expected);
    },
  );
});
