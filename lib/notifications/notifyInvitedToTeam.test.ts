import { describe, it, expect, vi, beforeEach } from 'vitest';

const notifyMock = vi.fn<
  (...args: unknown[]) => Promise<{ shouldAlsoSendMail: boolean }>
>();

vi.mock('./notify', () => ({
  notify: (...args: unknown[]) => notifyMock(...args),
}));

const GAME_ID = '00000000-0000-0000-0000-00000000aaaa';
const REQUEST_ID = '00000000-0000-0000-0000-00000000bbbb';
const RECIPIENT_ID = '00000000-0000-0000-0000-00000000cccc';

beforeEach(() => {
  notifyMock.mockReset();
  notifyMock.mockResolvedValue({ shouldAlsoSendMail: false });
});

describe('notifyInvitedToTeam', () => {
  it('happy path: kaller notify med team_invite-kind og full payload', async () => {
    const { notifyInvitedToTeam } = await import('./notifyInvitedToTeam');
    await notifyInvitedToTeam({
      recipientUserId: RECIPIENT_ID,
      gameId: GAME_ID,
      gameShortId: 'abc12345',
      gameName: 'Sommercup 2026',
      teamRequestId: REQUEST_ID,
      teamName: 'Birdie-jegerne',
      invitedByName: 'Per',
    });

    expect(notifyMock).toHaveBeenCalledWith({
      userId: RECIPIENT_ID,
      kind: 'team_invite',
      payload: {
        game_id: GAME_ID,
        game_short_id: 'abc12345',
        game_name: 'Sommercup 2026',
        team_name: 'Birdie-jegerne',
        invited_by_name: 'Per',
        request_id: REQUEST_ID,
      },
    });
  });

  it('feiler stille når notify kaster, logger og returnerer shouldAlsoSendMail=false', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    notifyMock.mockRejectedValueOnce(new Error('insert failed'));

    const { notifyInvitedToTeam } = await import('./notifyInvitedToTeam');
    const result = await notifyInvitedToTeam({
      recipientUserId: RECIPIENT_ID,
      gameId: GAME_ID,
      gameShortId: 'abc12345',
      gameName: 'Sommercup',
      teamRequestId: REQUEST_ID,
      teamName: 'Lag A',
      invitedByName: 'Kaptein',
    });

    expect(result).toEqual({ shouldAlsoSendMail: false });
    expect(consoleErr).toHaveBeenCalledWith(
      '[notifyInvitedToTeam] notify failed',
      expect.any(Error),
    );
    consoleErr.mockRestore();
  });

  it('returnerer shouldAlsoSendMail-flagget fra notify', async () => {
    notifyMock.mockResolvedValueOnce({ shouldAlsoSendMail: true });
    const { notifyInvitedToTeam } = await import('./notifyInvitedToTeam');
    const result = await notifyInvitedToTeam({
      recipientUserId: RECIPIENT_ID,
      gameId: GAME_ID,
      gameShortId: 'abc12345',
      gameName: 'Sommercup',
      teamRequestId: REQUEST_ID,
      teamName: 'Lag A',
      invitedByName: 'Kaptein',
    });
    expect(result.shouldAlsoSendMail).toBe(true);
  });
});
