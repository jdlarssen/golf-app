import { describe, it, expect, vi, beforeEach } from 'vitest';

// Admin-client mock — kontrolleres per test. notifyInvitedToGame henter
// games-rad + inviter-rad via admin-client (post-auth, server-only context).
type GameRow = {
  id: string;
  name: string;
  status: string;
  game_mode?: string;
  mode_config?: { team_size?: number } | null;
  scheduled_tee_off_at?: string | null;
  tee_interval_minutes?: number | null;
};
type UserRow = { id: string; name: string | null; email: string | null };

const gameMock = vi.fn<(...args: unknown[]) => Promise<{ data: GameRow | null; error: unknown }>>();
const userMock = vi.fn<(...args: unknown[]) => Promise<{ data: UserRow | null; error: unknown }>>();
// #2451: the roster, read only for a round with a tee-off and an interval.
const rosterMock = vi.fn<(...args: unknown[]) => Promise<{ data: unknown[] | null; error: unknown }>>();

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
      if (table === 'game_players') {
        return {
          select: () => ({
            eq: () => ({ returns: rosterMock }),
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
  rosterMock.mockReset();
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

  it('inviter mangler navn: bruker maskert e-post i invited_by_name (#2271)', async () => {
    gameMock.mockResolvedValueOnce({
      data: { id: GAME_ID, name: 'Vinter-cup', status: 'scheduled' },
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
          invited_by_name: 'ad•••@tornygolf.no',
        }),
      }),
    );
  });

  // #2445: et utkast varsler ingen; spillerne får beskjed når det publiseres.
  it.each([
    ['draft', 0],
    ['scheduled', 1],
    ['active', 1],
  ] as const)('status %s → %i varsel', async (status, expected) => {
    gameMock.mockResolvedValueOnce({
      data: { id: GAME_ID, name: 'Vinter-cup', status },
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

    expect(notifyMock).toHaveBeenCalledTimes(expected);
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

// #2451: with several start groups the invitation carries the player's own time.
describe('notifyInvitedToGame — egen starttid (#2451)', () => {
  const timedGame = {
    id: GAME_ID,
    name: 'Lørdagsrunden',
    status: 'scheduled',
    game_mode: 'best_ball',
    mode_config: { team_size: 2 },
    scheduled_tee_off_at: '2026-11-21T08:00:00.000Z',
    tee_interval_minutes: 10,
  };
  const roster = (recipientFlight: number) =>
    Array.from({ length: 8 }, (_, i) => ({
      user_id: i === 7 ? RECIPIENT_ID : `p${i}`,
      flight_number: i === 7 ? recipientFlight : i < 4 ? 1 : 2,
      team_number: Math.floor(i / 2) + 1,
      withdrawn_at: null,
    }));

  it('spilleren i flight 2 får tee_off_at 09:10 i payloaden', async () => {
    gameMock.mockResolvedValueOnce({ data: timedGame, error: null });
    userMock.mockResolvedValueOnce({ data: { id: INVITER_ID, name: 'Jørgen', email: 'j@example.com' }, error: null });
    rosterMock.mockResolvedValueOnce({ data: roster(2), error: null });
    const { notifyInvitedToGame } = await import('./notifyInvitedToGame');
    await notifyInvitedToGame({ recipientUserId: RECIPIENT_ID, gameId: GAME_ID, inviterUserId: INVITER_ID });
    expect(notifyMock).toHaveBeenCalledWith({
      userId: RECIPIENT_ID,
      kind: 'invite',
      payload: {
        game_id: GAME_ID,
        game_name: 'Lørdagsrunden',
        invited_by_name: 'Jørgen',
        tee_off_at: '2026-11-21T08:10:00.000Z',
      },
    });
  });

  it('uten intervall leses ikke rosteren, og payloaden er som før', async () => {
    gameMock.mockResolvedValueOnce({ data: { ...timedGame, tee_interval_minutes: null }, error: null });
    userMock.mockResolvedValueOnce({ data: { id: INVITER_ID, name: 'Jørgen', email: 'j@example.com' }, error: null });
    const { notifyInvitedToGame } = await import('./notifyInvitedToGame');
    await notifyInvitedToGame({ recipientUserId: RECIPIENT_ID, gameId: GAME_ID, inviterUserId: INVITER_ID });
    expect(rosterMock).not.toHaveBeenCalled();
    expect((notifyMock.mock.calls[0][0] as { payload: object }).payload).not.toHaveProperty('tee_off_at');
  });

  it('en feilet roster-lesing sender invitasjonen uten tid', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    gameMock.mockResolvedValueOnce({ data: timedGame, error: null });
    userMock.mockResolvedValueOnce({ data: { id: INVITER_ID, name: 'Jørgen', email: 'j@example.com' }, error: null });
    rosterMock.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    const { notifyInvitedToGame } = await import('./notifyInvitedToGame');
    await notifyInvitedToGame({ recipientUserId: RECIPIENT_ID, gameId: GAME_ID, inviterUserId: INVITER_ID });
    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect((notifyMock.mock.calls[0][0] as { payload: object }).payload).not.toHaveProperty('tee_off_at');
    errorSpy.mockRestore();
  });
});
