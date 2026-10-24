/**
 * How many players a league flight needs (#2638). One home for the marker rule
 * (AGENTS.md trap 4):
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

/** True when `playerCount` players are enough for a flight in this league. */
export function meetsFlightMinimum(playerCount: number, isSimulator: boolean): boolean {
  return playerCount >= minFlightPlayers(isSimulator);
}
