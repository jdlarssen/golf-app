/**
 * Player-count limits for the formats with a fixed roster size (#969, #2071,
 * #2222). This is the single home for those limits (AGENTS.md trap 4); every
 * layer that checks them reads from here:
 *
 *  - publishing: the mode validators in `gamePayload.ts`
 *  - the wizard: validity flags and missing-player messages in
 *    `useGameFormState.ts`, and the format filter `fitsPlayerCount`
 *  - the signup cap: `soloPlayerCap`
 *  - the start guard: `startScheduledGameCore` (an open-signup or
 *    manual-approval game is saved as a draft, so its count is first checked
 *    at start), and `rotationSlotRange` for Wolf / Round Robin
 *  - the app: `MAX_PLAYERS_BY_MODE` in `native/app/src/lib/rosterLimits.ts`
 *
 * `startPlayerCount.test.ts` runs the publish validator at each bound and locks
 * the numbers in the wizard and start-guard copy, which cannot read them.
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

// `as const` keeps the literal types: Round Robin's `teams_count` is typed `4`
// in its mode config, so a changed Round Robin limit is a type error there too.
export const START_COUNT_RANGES = {
  wolf: { min: 3, max: 5 },
  round_robin: { min: 4, max: 4 },
  acey_deucey: { min: 4, max: 4 },
  nines: { min: 3, max: 3 },
  nassau: { min: 2, max: 16 },
  skins: { min: 2, max: 16 },
  bingo_bango_bongo: { min: 2, max: 16 },
} as const satisfies Record<StartCountMode, { min: number; max: number }>;

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
  return isStartCountMode(gameMode) ? { ...START_COUNT_RANGES[gameMode] } : null;
}

/** Can `mode` be played by `n` active players? */
export function fitsStartCount(mode: StartCountMode, n: number): boolean {
  const { min, max } = START_COUNT_RANGES[mode];
  return n >= min && n <= max;
}
