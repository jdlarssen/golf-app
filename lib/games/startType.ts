/**
 * How a round starts (#2258): from the first tee, or as a shotgun where every
 * group starts on its own hole at the same time. Persisted as
 * `games.start_type` (0200, CHECK `games_start_type_valid` lists the same
 * values — `startType.test.ts` holds them together).
 *
 * No server imports: the terminliste row and, later, the native app read it.
 */

export const START_TYPES = ['first_tee', 'shotgun'] as const;

export type StartType = (typeof START_TYPES)[number];

/**
 * The wizard's «Shotgun-start» checkbox → a start type. Anything but the
 * checked value is a first-tee start, so a stale or tampered field can never
 * fail the CHECK.
 */
export function parseStartType(raw: unknown): StartType {
  return raw === 'shotgun' ? 'shotgun' : 'first_tee';
}
