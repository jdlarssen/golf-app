import type { TeeGenderChoice } from './playerGenderDefault';

/** Which tee-gender categories a tee box actually has a rating for. */
export interface TeeGenderAvailability {
  M: boolean;
  D: boolean;
  J: boolean;
}

/**
 * Clamps a player's tee-gender category to one the tee actually rates.
 * Returns `g` when it is available, otherwise the first available of
 * `['M','D','J']`, otherwise `g` as a last resort (never an empty value).
 *
 * Lives here, not in the web wizard's hook, because both wizards need it: the
 * web hook clamps in `setTeeBoxId`, the native wizard clamps when it reads the
 * draft. One rule, one home (AGENTS trap 4).
 */
export function clampGenderToTee(
  g: TeeGenderChoice,
  avail: TeeGenderAvailability,
): TeeGenderChoice {
  if (avail[g]) return g;
  const fallback = (['M', 'D', 'J'] as const).find((c) => avail[c]);
  return fallback ?? g;
}
