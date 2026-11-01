import { vi } from 'vitest';
import type { SignupViewerFacts } from '@/lib/games/loadSignupFacts';

/**
 * The shared test double for `loadSignupFacts` (#2748), picked up by
 * `vi.mock('@/lib/games/loadSignupFacts')` with no factory. Same reason as
 * `joinTeeGenders`: a queue-based Supabase mock would otherwise have its answers
 * eaten by the helper's reads. The helper's own behaviour is proven in
 * `loadSignupFacts.test.ts`.
 *
 * Default: a player with a finished profile and no link to the round yet. A test
 * that cares overrides it with `vi.mocked(loadSignupFacts).mockResolvedValueOnce(…)`.
 */
export const loadSignupFacts = vi.fn(
  async (): Promise<SignupViewerFacts> => ({
    profileCompleted: true,
    isAlreadyRegistered: false,
    requestView: 'none',
    hasPendingInvitation: false,
    isClubMember: false,
    viewerIsFriend: false,
  }),
);
