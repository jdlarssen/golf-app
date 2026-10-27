import { vi } from 'vitest';
import type { LeagueFlight } from '@/lib/league/leagueFlight';

/**
 * The shared test double for the league a game belongs to (#2661), picked up
 * by `vi.mock('@/lib/league/leagueFlight')` with no factory. The delivery and
 * approval tests for ordinary games only need «not a league flight»; what a
 * simulator flight does is proven where the marker rule is.
 *
 * Default: not a league flight. A test that cares overrides the answer.
 */
export const readLeagueFlight = vi.fn(async (_gameId: string): Promise<LeagueFlight | null> => null);
export const readSimulatorLeagueFlight = vi.fn(
  async (_gameId: string): Promise<LeagueFlight | null> => null,
);
