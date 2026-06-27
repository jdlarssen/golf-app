/**
 * Rotation-slot assignment for the rotating-partner formats (Wolf #465, Round
 * Robin #280). Both model the rotation as `game_players.team_number` (1..n,
 * mirrored to `flight_number` for the `game_players_team_flight_consistency`
 * DB-CHECK). The slot is NOT a team — it is a position in the hole-by-hole
 * rotation.
 *
 * Assignment happens at game start (see `startScheduledGame`), over the final
 * active roster, so an open-signup game can be published before anyone has
 * joined. The order is drawn randomly (crypto-backed) and is fair: for Wolf the
 * order decides who is wolf on which hole; for Round Robin every permutation
 * yields identical totals, so the draw is purely cosmetic there.
 *
 * Pure and deterministic under an injected `shuffle`, so callers/tests can pin
 * the order. The default shuffle is an unbiased Fisher–Yates backed by
 * `crypto.getRandomValues`.
 */
export type RotationSlotRow = {
  user_id: string;
  team_number: number;
  flight_number: number;
};

/** The rotating-partner formats whose slot is drawn at start (#969). */
export type RotationMode = 'wolf' | 'round_robin';

/**
 * Allowed active-roster size for a rotation format at start, or `null` for any
 * other mode. Wolf supports 3–5 players (#465); Round Robin is exactly 4. The
 * start-time guard uses this to block a game whose roster fell outside range
 * (open signup already caps the upper bound, so in practice this catches "too
 * few"). Keep in sync with `fitsPlayerCount` / `soloPlayerCap`.
 */
export function rotationSlotRange(
  gameMode: string,
): { min: number; max: number } | null {
  if (gameMode === 'wolf') return { min: 3, max: 5 };
  if (gameMode === 'round_robin') return { min: 4, max: 4 };
  return null;
}

/** Unbiased Fisher–Yates shuffle backed by WebCrypto (available in Node 18+). */
function cryptoShuffle<T>(input: T[]): T[] {
  const arr = input.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const j = buf[0] % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Returns one row per id with a contiguous rotation slot
 * `team_number = flight_number = 1..n` in the shuffled order. The slot order is
 * whatever `shuffle` produces — that is the single source of randomness.
 */
export function assignRotationSlots(
  activeUserIds: string[],
  shuffle: <T>(arr: T[]) => T[] = cryptoShuffle,
): RotationSlotRow[] {
  return shuffle(activeUserIds).map((user_id, idx) => ({
    user_id,
    team_number: idx + 1,
    flight_number: idx + 1,
  }));
}
