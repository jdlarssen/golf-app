/**
 * How many players a league flight needs and holds (#2638). One home for the
 * marker rule and the flight size (AGENTS.md trap 4):
 *
 *  - a regular league: two, the player and a marker who signs the card;
 *  - a simulator league: one, a player takes the round alone and types the
 *    score from the Trackman screen (the owner: «vi må nesten bare stole på
 *    hverandre»).
 *
 * The same number gates the start (`startLeagueRoundFlightCore`: fewer than
 * this → `need_marker`) and the count (`getLigaSnapshot`: a finished flight
 * counts only with this many delivered players). The web round start and the
 * app's start screen read it for the button.
 *
 * Imports nothing on purpose: the native app imports this file by relative path.
 */
export function minFlightPlayers(isSimulator: boolean): 1 | 2 {
  return isSimulator ? 1 : 2;
}

/**
 * The most players in one league flight: a physical flight on the course, the
 * same bound as `MAX_FLIGHT_SIZE` in `lib/games/flightScope.ts`. This file
 * imports nothing (see above), so it has its own constant, and
 * `flightRules.test.ts` locks the two together. The start core refuses a
 * bigger flight (`flight_too_large`); the web picker and the app route stop at
 * `MAX_CO_PLAYERS` besides the player.
 */
export const MAX_FLIGHT_PLAYERS = 4;
export const MAX_CO_PLAYERS = MAX_FLIGHT_PLAYERS - 1;

/** True when `playerCount` players are enough for a flight in this league. */
export function meetsFlightMinimum(playerCount: number, isSimulator: boolean): boolean {
  return playerCount >= minFlightPlayers(isSimulator);
}

/**
 * Why `playerCount` players cannot start a flight in this league, or null when
 * they can: more than a flight holds (`flight_too_large`), or fewer than the
 * marker rule needs (`need_marker`). The start core's one call for both bounds.
 */
export function flightSizeRefusal(
  playerCount: number,
  isSimulator: boolean,
): 'flight_too_large' | 'need_marker' | null {
  if (playerCount > MAX_FLIGHT_PLAYERS) return 'flight_too_large';
  return meetsFlightMinimum(playerCount, isSimulator) ? null : 'need_marker';
}
