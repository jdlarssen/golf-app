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

const TOKEN = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function inviteRow(
  status: string,
  teeBox: { name: string } | null = { name: 'Gul' },
) {
  return {
    data: {
      expires_at: '2100-01-01T00:00:00.000Z',
      inviter: { name: 'Kari', nickname: null },
      games: {
        id: 'game-1',
        name: 'E2E Fredagsrunden',
        game_mode: 'stableford',
        mode_config: { kind: 'stableford', team_size: 1 },
        scheduled_tee_off_at: null,
        status,
        courses: { name: 'Bogstad' },
        tee_box: teeBox,
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

describe('getInviteLoginContext — card fields (#2266)', () => {
  it('carries the mode config and the tee name', async () => {
    adminMock = buildSupabaseMock([inviteRow('scheduled')]);
    const { getInviteLoginContext } = await import('./getInviteLoginContext');

    const ctx = await getInviteLoginContext(TOKEN);

    expect(ctx).toMatchObject({
      modeConfig: { kind: 'stableford', team_size: 1 },
      teeName: 'Gul',
    });
  });

  it('a game without a tee box gives teeName null', async () => {
    adminMock = buildSupabaseMock([inviteRow('scheduled', null)]);
    const { getInviteLoginContext } = await import('./getInviteLoginContext');

    const ctx = await getInviteLoginContext(TOKEN);

    expect(ctx?.teeName).toBeNull();
  });
});
