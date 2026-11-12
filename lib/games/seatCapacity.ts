/**
 * Seats on a round with a player cap (#2258), and when it is full. No imports,
 * so the app (#2837) and the signup route read the same rule as the
 * terminliste without its server-side neighbours. `terminliste.ts` re-exports
 * it for the list's own readers.
 */

/**
 * Seats on a game, from `getRegistrationSeats`. `capped`: a format with a
 * player cap, and the seats the active roster holds (the same count the seat
 * claim checks). `matchplay`: whether both sides are full. A game without a cap
 * that is not matchplay has no entry.
 */
export type GameSeats =
  | { kind: 'capped'; cap: number; held: number }
  | { kind: 'matchplay'; full: boolean };

export type CapacityTone = 'normal' | 'low' | 'full';

/**
 * The capacity line: free seats, how much of the bar is filled (the share
 * taken, clamped to 0–1) and its tone — `low` with one or two seats left,
 * `full` at none.
 */
export function capacityState({ cap, held }: { cap: number; held: number }): {
  free: number;
  fillRatio: number;
  tone: CapacityTone;
} {
  const free = Math.max(0, cap - held);
  const fillRatio = cap <= 0 ? 1 : Math.min(1, Math.max(0, held / cap));
  const tone: CapacityTone = free === 0 ? 'full' : free <= 2 ? 'low' : 'normal';
  return { free, fillRatio, tone };
}

/**
 * #2837: a capped round with no seat left, the terminliste's «Fullt». The
 * signup offers a request instead of «Meld meg på» then. Matchplay is not
 * counted here: its side picker says which side has room.
 */
export function isCappedFull(seats: GameSeats | null | undefined): boolean {
  return seats?.kind === 'capped' && capacityState(seats).free === 0;
}
