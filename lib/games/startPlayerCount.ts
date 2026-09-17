/**
 * Start-time player-count limits for the formats with a fixed roster size
 * (#969, #2071). An open-signup or manual-approval game is saved as a draft, so
 * its player count is never checked before start — the signup cap stops "too
 * many", and `startScheduledGameCore` uses this to stop "too few".
 *
 * This is the single home for the start limit (AGENTS.md trap 4):
 * `rotationSlotRange` reads its Wolf / Round Robin numbers from here, and
 * `startPlayerCount.test.ts` asserts agreement with `fitsPlayerCount` and
 * `soloPlayerCap`.
 */
export const START_COUNT_MODES = [
  'wolf',
  'round_robin',
  'acey_deucey',
  'nines',
  'nassau',
  'skins',
  'bingo_bango_bongo',
] as const;

export type StartCountMode = (typeof START_COUNT_MODES)[number];

const RANGES: Record<StartCountMode, { min: number; max: number }> = {
  wolf: { min: 3, max: 5 },
  round_robin: { min: 4, max: 4 },
  acey_deucey: { min: 4, max: 4 },
  nines: { min: 3, max: 3 },
  nassau: { min: 2, max: 16 },
  skins: { min: 2, max: 16 },
  bingo_bango_bongo: { min: 2, max: 16 },
};

export function isStartCountMode(gameMode: string): gameMode is StartCountMode {
  return (START_COUNT_MODES as readonly string[]).includes(gameMode);
}

/**
 * Allowed active (non-withdrawn) roster size at start, or `null` for a format
 * without a fixed-count start limit.
 */
export function startPlayerCountRange(
  gameMode: string,
): { min: number; max: number } | null {
  return isStartCountMode(gameMode) ? { ...RANGES[gameMode] } : null;
}
