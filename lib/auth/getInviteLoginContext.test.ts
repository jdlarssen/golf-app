import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

/**
 * #2212: the invite card on `/login?invite=…` promises «X invited you to the
 * round Y». Once the round has started, logging in no longer puts the invitee
 * on the roster, so the card must disappear — same fail-closed figure as an
 * unknown token.
 */

let adminMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminMock,
}));

const TOKEN = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

function inviteRow(status: string) {
  return {
    data: {
      expires_at: '2100-01-01T00:00:00.000Z',
      inviter: { name: 'Kari', nickname: null },
      games: {
        id: 'game-1',
        name: 'E2E Fredagsrunden',
        game_mode: 'stableford',
        scheduled_tee_off_at: null,
        status,
        courses: { name: 'Bogstad' },
      },
    },
    error: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getInviteLoginContext — roster lock (#2212)', () => {
  it.each<[string, boolean]>([
    ['scheduled', true],
    ['active', false],
    ['finished', false],
  ])('%s round → card shown: %s', async (status, shown) => {
    adminMock = buildSupabaseMock([inviteRow(status)]);
    const { getInviteLoginContext } = await import('./getInviteLoginContext');

    const ctx = await getInviteLoginContext(TOKEN);

    if (shown) {
      expect(ctx).toMatchObject({ gameId: 'game-1', gameName: 'E2E Fredagsrunden' });
    } else {
      expect(ctx).toBeNull();
    }
  });
});
