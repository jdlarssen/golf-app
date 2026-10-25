import { vi } from 'vitest';
import type { LeagueRoundSweepRound } from '@/lib/notifications/leagueRoundNotices';

/**
 * The shared test double for the league round's two messages (#2638), picked
 * up by `vi.mock('@/lib/notifications/leagueRoundNotices')` with no factory.
 * The sweep route only has to hand each round over; what a round's messages
 * do is proven in `leagueRoundNotices.test.ts`.
 *
 * Default: sends nothing. A test that cares overrides the answer.
 */
export const runLeagueRoundNotices = vi.fn(
  async (
    _admin: unknown,
    _round: LeagueRoundSweepRound,
    _now: number,
  ): Promise<{ sent: { league_round_open: number; league_round_closing: number } }> => ({
    sent: { league_round_open: 0, league_round_closing: 0 },
  }),
);
