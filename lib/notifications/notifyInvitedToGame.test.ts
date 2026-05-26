import { describe, it, expect, vi, beforeEach } from 'vitest';

// Admin-client mock — kontrolleres per test. notifyInvitedToGame henter
// games-rad + inviter-rad via admin-client (post-auth, server-only context).
type GameRow = { id: string; name: string; status: string };
type UserRow = { id: string; name: string | null; email: string | null };

const gameMock = vi.fn<(...args: unknown[]) => Promise<{ data: GameRow | null; error: unknown }>>();
const userMock = vi.fn<(...args: unknown[]) => Promise<{ data: UserRow | null; error: unknown }>>();

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      if (table === 'games') {
        return {
          select: () => ({
            eq: () => ({ single: gameMock }),
          }),
        };
      }
      if (table === 'users') {
        return {
          select: () => ({
            eq: () => ({ single: userMock }),
          }),
        };
      }
      throw new Error(`unexpected from(${table}) call`);
    },
  }),
}));

const notifyMock = vi.fn<
  (...args: unknown[]) => Promise<{ shouldAlsoSendMail: boolean }>
>();
vi.mock('./notify', () => ({
  notify: (...args: unknown[]) => notifyMock(...args),
}));

const GAME_ID = '00000000-0000-0000-0000-00000000aaaa';
const RECIPIENT_ID = '00000000-0000-0000-0000-00000000bbbb';
const INVITER_ID = '00000000-0000-0000-0000-00000000cccc';

beforeEach(() => {
  gameMock.mockReset();
  userMock.mockReset();
  notifyMock.mockReset();
  notifyMock.mockResolvedValue({ shouldAlsoSendMail: false });
});

describe('notifyInvitedToGame', () => {
  it('happy path: henter spill + inviter, kaller notify med invite-payload', async () => {
    gameMock.mockResolvedValueOnce({
      data: { id: GAME_ID, name: 'Vinter-cup', status: 'scheduled' },
      error: null,
    });
    userMock.mockResolvedValueOnce({
      data: { id: INVITER_ID, name: 'Jørgen', email: 'j@example.com' },
      error: null,
    });

    const { notifyInvitedToGame } = await import('./notifyInvitedToGame');
    await notifyInvitedToGame({
      recipientUserId: RECIPIENT_ID,
      gameId: GAME_ID,
      inviterUserId: INVITER_ID,
    });

    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledWith({
      userId: RECIPIENT_ID,
      kind: 'invite',
      payload: {
        game_id: GAME_ID,
        game_name: 'Vinter-cup',
        invited_by_name: 'Jørgen',
      },
    });
  });

  it('inviter mangler navn: bruker email-fallback i invited_by_name', async () => {
    gameMock.mockResolvedValueOnce({
      data: { id: GAME_ID, name: 'Vinter-cup', status: 'draft' },
      error: null,
    });
    userMock.mockResolvedValueOnce({
      data: { id: INVITER_ID, name: null, email: 'admin@tornygolf.no' },
      error: null,
    });

    const { notifyInvitedToGame } = await import('./notifyInvitedToGame');
    await notifyInvitedToGame({
      recipientUserId: RECIPIENT_ID,
      gameId: GAME_ID,
      inviterUserId: INVITER_ID,
    });

    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          invited_by_name: 'admin@tornygolf.no',
        }),
      }),
    );
  });

  it('finished-spill: hopper over notify (varsel er meningsløst)', async () => {
    gameMock.mockResolvedValueOnce({
      data: { id: GAME_ID, name: 'Sluttspill', status: 'finished' },
      error: null,
    });

    const { notifyInvitedToGame } = await import('./notifyInvitedToGame');
    await notifyInvitedToGame({
      recipientUserId: RECIPIENT_ID,
      gameId: GAME_ID,
      inviterUserId: INVITER_ID,
    });

    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('spill ikke funnet: logger og swallow-er stille', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    gameMock.mockResolvedValueOnce({ data: null, error: { message: 'not found' } });

    const { notifyInvitedToGame } = await import('./notifyInvitedToGame');
    await notifyInvitedToGame({
      recipientUserId: RECIPIENT_ID,
      gameId: GAME_ID,
      inviterUserId: INVITER_ID,
    });

    expect(notifyMock).not.toHaveBeenCalled();
    expect(consoleErr).toHaveBeenCalledWith(
      '[notifyInvitedToGame] game lookup failed',
      expect.anything(),
    );
    consoleErr.mockRestore();
  });

  it('inviter ikke funnet: logger og swallow-er stille', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    gameMock.mockResolvedValueOnce({
      data: { id: GAME_ID, name: 'Vinter-cup', status: 'scheduled' },
      error: null,
    });
    userMock.mockResolvedValueOnce({ data: null, error: { message: 'not found' } });

    const { notifyInvitedToGame } = await import('./notifyInvitedToGame');
    await notifyInvitedToGame({
      recipientUserId: RECIPIENT_ID,
      gameId: GAME_ID,
      inviterUserId: INVITER_ID,
    });

    expect(notifyMock).not.toHaveBeenCalled();
    expect(consoleErr).toHaveBeenCalledWith(
      '[notifyInvitedToGame] inviter lookup failed',
      expect.anything(),
    );
    consoleErr.mockRestore();
  });

  it('notify() kaster: feilen swallow-es og logges med riktig prefix', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    gameMock.mockResolvedValueOnce({
      data: { id: GAME_ID, name: 'Vinter-cup', status: 'scheduled' },
      error: null,
    });
    userMock.mockResolvedValueOnce({
      data: { id: INVITER_ID, name: 'Jørgen', email: 'j@example.com' },
      error: null,
    });
    notifyMock.mockRejectedValueOnce(new Error('insert failed'));

    const { notifyInvitedToGame } = await import('./notifyInvitedToGame');
    await expect(
      notifyInvitedToGame({
        recipientUserId: RECIPIENT_ID,
        gameId: GAME_ID,
        inviterUserId: INVITER_ID,
      }),
    ).resolves.toBeUndefined();

    expect(consoleErr).toHaveBeenCalledWith(
      '[notifyInvitedToGame] notify failed',
      expect.any(Error),
    );
    consoleErr.mockRestore();
  });
});
