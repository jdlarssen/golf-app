import { describe, it, expect, vi, beforeEach } from 'vitest';

const notifyMock = vi.fn<
  (...args: unknown[]) => Promise<{ shouldAlsoSendMail: boolean }>
>();
vi.mock('./notify', () => ({
  notify: (...args: unknown[]) => notifyMock(...args),
}));

import { notifyPlayersGameFinished } from './events';

beforeEach(() => {
  notifyMock.mockReset();
});

describe('notifyPlayersGameFinished', () => {
  it('returnerer per-spiller shouldAlsoSendMail-map fra notify-resultatene', async () => {
    notifyMock
      .mockResolvedValueOnce({ shouldAlsoSendMail: true })
      .mockResolvedValueOnce({ shouldAlsoSendMail: false });

    const result = await notifyPlayersGameFinished(
      [{ user_id: 'a' }, { user_id: 'b' }],
      { id: 'game-1', name: 'Vinter-cup' },
      'endGame',
    );

    expect(result.get('a')).toBe(true);
    expect(result.get('b')).toBe(false);
    expect(notifyMock).toHaveBeenCalledTimes(2);
    expect(notifyMock).toHaveBeenCalledWith({
      userId: 'a',
      kind: 'game_finished',
      payload: { game_id: 'game-1', game_name: 'Vinter-cup' },
    });
  });

  it('utelater spiller fra mappen ved notify-rejection (mail-gating fail-closed)', async () => {
    // Hvis notify rejecter for én spiller, defaultes sendMail til false ved
    // .get() (returnerer undefined, som filtrerer ut i caller-en). Speiler
    // submitScorecard- og approve-flytenes fail-closed-rasjonale: aldri
    // mail uten in-app-varsel.
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    notifyMock
      .mockResolvedValueOnce({ shouldAlsoSendMail: true })
      .mockRejectedValueOnce(new Error('insert failed'));

    const result = await notifyPlayersGameFinished(
      [{ user_id: 'a' }, { user_id: 'b' }],
      { id: 'game-1', name: 'Vinter-cup' },
      'endGame',
    );

    expect(result.get('a')).toBe(true);
    expect(result.has('b')).toBe(false);
    expect(consoleErr).toHaveBeenCalledWith(
      '[endGame] game_finished notify failed',
      expect.any(Error),
    );
    consoleErr.mockRestore();
  });

  it('log-prefix kommer fra parameter (skiller endGame fra endGameWithSideWinners i Vercel logs)', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    notifyMock.mockRejectedValueOnce(new Error('boom'));

    await notifyPlayersGameFinished(
      [{ user_id: 'a' }],
      { id: 'game-1', name: 'X' },
      'endGameWithSideWinners',
    );

    expect(consoleErr).toHaveBeenCalledWith(
      '[endGameWithSideWinners] game_finished notify failed',
      expect.any(Error),
    );
    consoleErr.mockRestore();
  });

  it('tom spillerliste → tom map, ingen notify-call', async () => {
    const result = await notifyPlayersGameFinished(
      [],
      { id: 'game-1', name: 'X' },
      'endGame',
    );

    expect(result.size).toBe(0);
    expect(notifyMock).not.toHaveBeenCalled();
  });
});
