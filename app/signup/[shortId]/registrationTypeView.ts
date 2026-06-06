import type { RegistrationType } from '@/lib/games/registration';

/**
 * Hvilken påmeldings-form den offentlige signup-siden skal vise, utledet fra
 * spillets `registration_type` og hvorvidt scoring-modusen har lag-konsept.
 *
 * Ren utvalgs-logikk (Type-A-testbar) trukket ut av `page.tsx`-`renderBody` så
 * lag-/solo-grenen kan dekkes uten å rendre hele server-komponenten.
 *
 * Tre utfall:
 *  - `team_form`: intensjonen er team/both OG modusen har lag-konsept.
 *  - `team_unsupported_mode`: `'team'` på en solo-format. Ingen solo-intensjon
 *    er erklært, så vi viser en informativ blindvei i stedet for å la folk
 *    melde seg på solo. Kun nåbar ved korrupt data — `buildGameInsertPayload`
 *    gater dette ved opprett/rediger (`team_registration_unsupported_mode`).
 *  - `solo_form`: `'solo'`, ELLER `'both'` på en solo-format.
 */
export type RegistrationTypeView =
  | { kind: 'team_form' }
  | { kind: 'team_unsupported_mode' }
  | { kind: 'solo_form' };

export function resolveRegistrationTypeView(
  registrationType: RegistrationType,
  modeSupportsTeams: boolean,
): RegistrationTypeView {
  // Lag-form kun når både intensjonen (team/both) OG modusen tillater lag.
  if (
    (registrationType === 'team' || registrationType === 'both') &&
    modeSupportsTeams
  ) {
    return { kind: 'team_form' };
  }

  // `'team'` på en modus uten lag-konsept: ingen solo-intensjon erklært →
  // informativ blindvei.
  if (registrationType === 'team' && !modeSupportsTeams) {
    return { kind: 'team_unsupported_mode' };
  }

  // `'solo'`, ELLER `'both'` på en modus uten lag-konsept. #466: `'both'`
  // tillater eksplisitt solo, så vi faller til solo-formen i stedet for en
  // blindvei — ellers blir spillet umulig å melde seg på via lenken.
  return { kind: 'solo_form' };
}
