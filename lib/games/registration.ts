// Registreringsmodus-helpers for self-påmelding (#199).
//
// To akser:
//   - registration_mode: hvem kan melde seg på (invite_only / manual_approval / open)
//   - registration_type: hva man melder på (solo / team / both)
//
// Speilar DB-enumene fra migrasjon 0040. Holdt utenfor scoring-modulene fordi
// dette er en form-/admin-konsept som ikke berører scoring-pipeline.

import type { GameMode } from '@/lib/scoring/modes/types';

export type RegistrationMode = 'invite_only' | 'manual_approval' | 'open';
export type RegistrationType = 'solo' | 'team' | 'both';

export const REGISTRATION_MODES: readonly RegistrationMode[] = [
  'invite_only',
  'manual_approval',
  'open',
] as const;

export const REGISTRATION_TYPES: readonly RegistrationType[] = [
  'solo',
  'team',
  'both',
] as const;

/**
 * Hvorvidt en gitt scoring-modus har lag-konsept (slik at registration_type
 * 'team' eller 'both' gir mening). Solo-modi som stableford/solo-strokeplay/
 * singles-matchplay kjører kun individuell scoring og kan ikke ta lag-
 * påmeldinger uten å bryte scoring-modellen.
 *
 * Source of truth her — kontrakt #199 listet best_ball + texas_scramble
 * eksplisitt; stableford er per definisjon solo siden par-stableford
 * persisteres med samme `kind` men forskjellig team_size, og lag-påmelding
 * må vite team-strukturen ved registreringstidspunkt (4BBB-par-stableford
 * krever at vi vet om innkommende registrering er par-rad eller solo-rad).
 * Vi holder den smal i v1 og åpner for stableford senere hvis nødvendig.
 */
export function gameModeSupportsTeams(mode: GameMode): boolean {
  return mode === 'best_ball' || mode === 'texas_scramble' || mode === 'ambrose' || mode === 'florida_scramble' || mode === 'patsome';
}

export function isRegistrationMode(v: unknown): v is RegistrationMode {
  return v === 'invite_only' || v === 'manual_approval' || v === 'open';
}

export function isRegistrationType(v: unknown): v is RegistrationType {
  return v === 'solo' || v === 'team' || v === 'both';
}
