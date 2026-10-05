import { vi } from 'vitest';
import type { StaleSweepGame } from '@/lib/notifications/organizerNotices';

/**
 * The shared test double for the organiser's finish messages (#2203), picked
 * up by `vi.mock('@/lib/notifications/organizerNotices')` with no factory.
 * A delivery, an approval or a withdrawal only has to ASK for «Alle har
 * levert»; what the message does is proven in `organizerNotices.test.ts`.
 * Mocking it here also keeps its reads off the callers' queue-based Supabase
 * doubles, which would otherwise have their answers eaten.
 *
 * Default: does nothing / reminds nobody. A test that cares asserts on
 * `vi.mocked(notifyOrganizerIfAllDelivered)` or overrides the answer.
 */
export const notifyOrganizerIfAllDelivered = vi.fn(
  async (_gameId: string, _actorId: string, _logPrefix: string): Promise<void> => {},
);

export const runStaleGameReminderForGame = vi.fn(
  async (_admin: unknown, _game: StaleSweepGame, _now: number): Promise<{ reminded: boolean }> => ({
    reminded: false,
  }),
);
