import { tableRounds } from './standingsFormat';

/**
 * `tableRounds` as of this request (#1378). The two league pages call it on the
 * server so the client never reads the clock, which would make hydration
 * unstable. Kept out of the pages themselves: `Date.now()` in a page body trips
 * react-hooks/purity.
 */
export function tableRoundsNow<T extends { id: string; sequence: number; opensAt: string; closesAt: string }>(
  rounds: readonly T[],
) {
  return tableRounds(rounds, Date.now());
}
