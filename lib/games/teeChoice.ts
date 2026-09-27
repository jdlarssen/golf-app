// lib/games/teeChoice.ts
// #2209: which tee category (M/D/J) a player plays from — the one home for the
// rule every path that puts a player in a game uses: the web wizard and edit
// form, the join paths (sign-up, approval, team invite, «Inviter», login via
// invitation) and the app.
//
// Imported by the web, server code AND the app (Metro), so it may only import
// other pure modules, and only by relative path: Metro does not resolve `@/`.
//
// Moved from `native/app/src/lib/teeChoice.ts` (#1859), which now re-exports it.
//
// **`null` override means «follow the profile», not «men».** The clamp runs when
// the value is read, so a player added after the tee was picked still gets a
// category the tee rates.
import {
  playerGenderDefault,
  type PlayerLevel,
  type TeeGenderChoice,
  type UserGender,
} from './playerGenderDefault';
import {
  clampGenderToTee,
  type TeeGenderAvailability,
} from './clampGenderToTee';
import {
  getRatingForGender,
  type TeeBoxRatings,
  type TeeGender,
} from './teeRating';

export type { TeeGenderAvailability };

/** No tee picked = no restriction yet. */
export const ALL_TEE_GENDERS: TeeGenderAvailability = { M: true, D: true, J: true };

/** The profile fields the rule reads. Raw DB strings, as the rows carry them. */
export interface TeeProfile {
  gender: string | null;
  level: string | null;
}

// `users.gender` and `users.level` arrive as raw strings (candidate rows mirror
// the columns, not the enums). The narrowing lives HERE, where the values meet
// the shared helper, instead of every caller guessing.
export function asUserGender(raw: string | null): UserGender {
  return raw === 'mens' || raw === 'ladies' ? raw : null;
}

export function asPlayerLevel(raw: string | null): PlayerLevel {
  return raw === 'junior' || raw === 'senior' ? raw : 'normal';
}

/** A raw M/D/J string (a form field) → the choice. Anything else → M. */
export function asTeeChoice(raw: string): TeeGenderChoice {
  return raw === 'D' || raw === 'J' ? raw : 'M';
}

/** The category the profile points at, before clamping. Unknown profile → M. */
export function defaultTeeGender(
  profile: TeeProfile | null | undefined,
): TeeGenderChoice {
  return playerGenderDefault(
    asUserGender(profile?.gender ?? null),
    asPlayerLevel(profile?.level ?? null),
  );
}

/**
 * The category the player actually plays from: the organiser's override when
 * there is one, otherwise the profile default — both clamped to one the tee
 * rates.
 *
 * @param override the organiser's choice, or `null` for «follow the profile»
 * @param profile the player's profile, or `null` when it is not known yet
 */
export function resolveTeeGender(
  override: TeeGenderChoice | null,
  profile: TeeProfile | null | undefined,
  avail: TeeGenderAvailability,
): TeeGenderChoice {
  return clampGenderToTee(override ?? defaultTeeGender(profile), avail);
}

/**
 * Which categories a tee rates. `null` (no tee known) → all three. A category
 * counts only when its whole set is present — the same rule the start code
 * applies through `getRatingForGender`.
 */
export function teeAvailabilityOf(
  tee: TeeBoxRatings | null | undefined,
): TeeGenderAvailability {
  if (!tee) return ALL_TEE_GENDERS;
  return {
    M: getRatingForGender(tee, 'mens') !== null,
    D: getRatingForGender(tee, 'ladies') !== null,
    J: getRatingForGender(tee, 'juniors') !== null,
  };
}

/** M/D/J → `game_players.tee_gender`. */
export function teeChoiceToDb(c: TeeGenderChoice): TeeGender {
  return c === 'D' ? 'ladies' : c === 'J' ? 'juniors' : 'mens';
}

/**
 * The `game_players.tee_gender` a player gets when no one chose for them: the
 * profile default, clamped to the game's tee. The rule every insert path uses.
 */
export function profileTeeGender(
  profile: TeeProfile | null | undefined,
  tee: TeeBoxRatings | null | undefined,
): TeeGender {
  return teeChoiceToDb(resolveTeeGender(null, profile, teeAvailabilityOf(tee)));
}
