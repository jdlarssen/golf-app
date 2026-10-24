/**
 * What the create form preselects when the organiser switches «Simulator» on
 * (#2638, the owner's answer: stableford where the best rounds count, e.g. 5 of
 * 7, and a round every 14 days as the issue says). The organiser can change
 * every one of them; regular leagues get no new defaults.
 */
export const SIMULATOR_DEFAULTS = {
  format: 'stableford',
  standingsModel: 'best_n',
  frequency: 'biweekly',
} as const;

/** Best N for a simulator league: all rounds but two, at least one (7 → 5). */
export function defaultBestN(roundCount: number): number {
  return Math.max(1, roundCount - 2);
}
