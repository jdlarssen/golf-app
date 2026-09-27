import { vi } from 'vitest';
import type { TeeGender } from '@/lib/games/teeRating';

/**
 * The shared test double for `joinTeeGenders` (#2209), picked up by
 * `vi.mock('@/lib/games/joinTeeGenders')` with no factory. Action tests mock
 * the helper here instead of letting it read through their Supabase doubles —
 * a queue-based mock would otherwise have its answers eaten by the helper's two
 * reads. The helper's own behaviour is proven in `joinTeeGenders.test.ts`.
 *
 * Default: 'mens' for every id — what the rows got before #2209. A test that
 * cares overrides it with `vi.mocked(joinTeeGenders).mockResolvedValueOnce(…)`.
 */
export const joinTeeGenders = vi.fn(
  async (_gameId: string, userIds: readonly string[]): Promise<Record<string, TeeGender>> =>
    Object.fromEntries(userIds.map((id) => [id, 'mens' as const])),
);
