import { describe, it, expect, vi, beforeEach } from 'vitest';

const notifyMock = vi.fn<
  (...args: unknown[]) => Promise<{ shouldAlsoSendMail: boolean }>
>();
// Behold den ekte `shouldSendMailFallback` (+ terskel) så off-app-partisjonen i
// events.ts måles med samme logikk som prod; kun `notify` erstattes med spionen.
vi.mock('./notify', async (importActual) => {
  const actual = await importActual<typeof import('./notify')>();
  return {
    ...actual,
    notify: (...args: unknown[]) => notifyMock(...args),
  };
});

// Admin-client mock for `notifyPlayersGameStarted`s last_seen_at-oppslag.
// Kjeden er `from('users').select(...).in(...).returns()`.
const usersReturnsMock = vi.fn<
  (...args: unknown[]) => Promise<{ data: unknown; error: unknown }>
>();
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      if (table === 'users') {
        return {
          select: () => ({
            in: () => ({ returns: usersReturnsMock }),
          }),
        };
      }
      throw new Error(`unexpected from(${table}) call`);
    },
  }),
}));

import {
  notifyPlayersGameFinished,
  notifyPlayersGameStarted,
  notifyParticipantsCupFinished,
  notifyParticipantsCupStarted,
} from './events';
import { OFF_APP_THRESHOLD_MS } from './notify';

// Ferske/gamle last_seen_at-verdier relativt til off-app-terskelen (5 min).
const FRESH = new Date(Date.now() - 60 * 1000).toISOString(); // 1 min → on-app
const STALE = new Date(
  Date.now() - OFF_APP_THRESHOLD_MS - 60 * 1000,
).toISOString(); // > terskel → off-app

beforeEach(() => {
  notifyMock.mockReset();
  usersReturnsMock.mockReset();
  // Default: alle spillere off-app (behold raden) med mindre testen sier annet.
  usersReturnsMock.mockResolvedValue({ data: [], error: null });
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

describe('notifyParticipantsCupFinished', () => {
  it('fyrer cup_finished in-app per deltaker + returnerer shouldAlsoSendMail-map', async () => {
    notifyMock
      .mockResolvedValueOnce({ shouldAlsoSendMail: true })
      .mockResolvedValueOnce({ shouldAlsoSendMail: false });

    const result = await notifyParticipantsCupFinished(
      [{ user_id: 'a' }, { user_id: 'b' }],
      { id: 'tour-1', name: 'Vinter-cup' },
      'finishTournament',
    );

    expect(result.get('a')).toBe(true);
    expect(result.get('b')).toBe(false);
    expect(notifyMock).toHaveBeenCalledTimes(2);
    expect(notifyMock).toHaveBeenCalledWith({
      userId: 'a',
      kind: 'cup_finished',
      payload: { tournament_id: 'tour-1', tournament_name: 'Vinter-cup' },
    });
  });

  it('utelater deltaker fra mappen ved notify-rejection (mail-gating fail-closed)', async () => {
    // Samme fail-closed-rasjonale som game_finished: aldri mail uten in-app.
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    notifyMock
      .mockResolvedValueOnce({ shouldAlsoSendMail: true })
      .mockRejectedValueOnce(new Error('insert failed'));

    const result = await notifyParticipantsCupFinished(
      [{ user_id: 'a' }, { user_id: 'b' }],
      { id: 'tour-1', name: 'Vinter-cup' },
      'finishTournament',
    );

    expect(result.get('a')).toBe(true);
    expect(result.has('b')).toBe(false);
    expect(consoleErr).toHaveBeenCalledWith(
      '[finishTournament] cup_finished notify failed',
      expect.any(Error),
    );
    consoleErr.mockRestore();
  });

  it('log-prefix kommer fra parameter', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    notifyMock.mockRejectedValueOnce(new Error('boom'));

    await notifyParticipantsCupFinished(
      [{ user_id: 'a' }],
      { id: 'tour-1', name: 'X' },
      'finishTournament',
    );

    expect(consoleErr).toHaveBeenCalledWith(
      '[finishTournament] cup_finished notify failed',
      expect.any(Error),
    );
    consoleErr.mockRestore();
  });

  it('tom deltakerliste → tom map, ingen notify-call', async () => {
    const result = await notifyParticipantsCupFinished(
      [],
      { id: 'tour-1', name: 'X' },
      'finishTournament',
    );

    expect(result.size).toBe(0);
    expect(notifyMock).not.toHaveBeenCalled();
  });
});

describe('notifyParticipantsCupStarted', () => {
  it('fyrer cup_started in-app per deltaker + returnerer shouldAlsoSendMail-map', async () => {
    notifyMock
      .mockResolvedValueOnce({ shouldAlsoSendMail: true })
      .mockResolvedValueOnce({ shouldAlsoSendMail: false });

    const result = await notifyParticipantsCupStarted(
      [{ user_id: 'a' }, { user_id: 'b' }],
      { id: 'tour-1', name: 'Vinter-cup' },
      'startTournament',
    );

    expect(result.get('a')).toBe(true);
    expect(result.get('b')).toBe(false);
    expect(notifyMock).toHaveBeenCalledTimes(2);
    expect(notifyMock).toHaveBeenCalledWith({
      userId: 'a',
      kind: 'cup_started',
      payload: { tournament_id: 'tour-1', tournament_name: 'Vinter-cup' },
    });
  });

  it('utelater deltaker fra mappen ved notify-rejection (mail-gating fail-closed)', async () => {
    // Samme fail-closed-rasjonale som cup_finished: aldri mail uten in-app.
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    notifyMock
      .mockResolvedValueOnce({ shouldAlsoSendMail: true })
      .mockRejectedValueOnce(new Error('insert failed'));

    const result = await notifyParticipantsCupStarted(
      [{ user_id: 'a' }, { user_id: 'b' }],
      { id: 'tour-1', name: 'Vinter-cup' },
      'startTournament',
    );

    expect(result.get('a')).toBe(true);
    expect(result.has('b')).toBe(false);
    expect(consoleErr).toHaveBeenCalledWith(
      '[startTournament] cup_started notify failed',
      expect.any(Error),
    );
    consoleErr.mockRestore();
  });

  it('log-prefix kommer fra parameter', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    notifyMock.mockRejectedValueOnce(new Error('boom'));

    await notifyParticipantsCupStarted(
      [{ user_id: 'a' }],
      { id: 'tour-1', name: 'X' },
      'startTournament',
    );

    expect(consoleErr).toHaveBeenCalledWith(
      '[startTournament] cup_started notify failed',
      expect.any(Error),
    );
    consoleErr.mockRestore();
  });

  it('tom deltakerliste → tom map, ingen notify-call', async () => {
    const result = await notifyParticipantsCupStarted(
      [],
      { id: 'tour-1', name: 'X' },
      'startTournament',
    );

    expect(result.size).toBe(0);
    expect(notifyMock).not.toHaveBeenCalled();
  });
});

describe('notifyPlayersGameStarted (#502, #1134)', () => {
  it('sender game_started til off-app-spillere', async () => {
    notifyMock.mockResolvedValue({ shouldAlsoSendMail: true });
    usersReturnsMock.mockResolvedValue({
      data: [
        { id: 'a', last_seen_at: STALE },
        { id: 'b', last_seen_at: null },
      ],
      error: null,
    });

    await notifyPlayersGameStarted(
      [{ user_id: 'a' }, { user_id: 'b' }],
      { id: 'game-1', name: 'Byneset North' },
      'cron/start-scheduled-games',
    );

    expect(notifyMock).toHaveBeenCalledTimes(2);
    expect(notifyMock).toHaveBeenCalledWith({
      userId: 'a',
      kind: 'game_started',
      payload: { game_id: 'game-1', game_name: 'Byneset North' },
    });
  });

  it('#1134: dropper raden for on-app-spiller, beholder for off-app', async () => {
    notifyMock.mockResolvedValue({ shouldAlsoSendMail: true });
    usersReturnsMock.mockResolvedValue({
      data: [
        { id: 'a', last_seen_at: FRESH }, // on-app → ingen rad
        { id: 'b', last_seen_at: STALE }, // off-app → rad
      ],
      error: null,
    });

    await notifyPlayersGameStarted(
      [{ user_id: 'a' }, { user_id: 'b' }],
      { id: 'game-1', name: 'X' },
      'cron/start-scheduled-games',
    );

    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'b', kind: 'game_started' }),
    );
  });

  it('#1134: alle on-app → ingen notify-call', async () => {
    usersReturnsMock.mockResolvedValue({
      data: [
        { id: 'a', last_seen_at: FRESH },
        { id: 'b', last_seen_at: FRESH },
      ],
      error: null,
    });

    await notifyPlayersGameStarted(
      [{ user_id: 'a' }, { user_id: 'b' }],
      { id: 'game-1', name: 'X' },
      'cron/start-scheduled-games',
    );

    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('#1134: fail-open ved users-query-error → alle varsles', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    notifyMock.mockResolvedValue({ shouldAlsoSendMail: true });
    usersReturnsMock.mockResolvedValue({
      data: null,
      error: { message: 'timeout' },
    });

    await notifyPlayersGameStarted(
      [{ user_id: 'a' }, { user_id: 'b' }],
      { id: 'game-1', name: 'X' },
      'cron/start-scheduled-games',
    );

    expect(notifyMock).toHaveBeenCalledTimes(2);
    expect(consoleErr).toHaveBeenCalledWith(
      '[cron/start-scheduled-games] game_started last_seen_at lookup failed',
      expect.objectContaining({ message: 'timeout' }),
    );
    consoleErr.mockRestore();
  });

  it('#1134: fail-open for spiller uten users-rad → varslet', async () => {
    notifyMock.mockResolvedValue({ shouldAlsoSendMail: true });
    usersReturnsMock.mockResolvedValue({
      // 'b' mangler helt fra resultatet → behandles off-app (fail-open).
      data: [{ id: 'a', last_seen_at: FRESH }],
      error: null,
    });

    await notifyPlayersGameStarted(
      [{ user_id: 'a' }, { user_id: 'b' }],
      { id: 'game-1', name: 'X' },
      'cron/start-scheduled-games',
    );

    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'b' }),
    );
  });

  it('tom spillerliste → ingen notify, ingen users-oppslag (tidlig retur)', async () => {
    await notifyPlayersGameStarted(
      [],
      { id: 'game-1', name: 'X' },
      'cron/start-scheduled-games',
    );

    expect(notifyMock).not.toHaveBeenCalled();
    expect(usersReturnsMock).not.toHaveBeenCalled();
  });

  it('logger notify-rejection uten å kaste (best-effort)', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    usersReturnsMock.mockResolvedValue({
      data: [
        { id: 'a', last_seen_at: STALE },
        { id: 'b', last_seen_at: STALE },
      ],
      error: null,
    });
    notifyMock
      .mockResolvedValueOnce({ shouldAlsoSendMail: false })
      .mockRejectedValueOnce(new Error('insert failed'));

    await expect(
      notifyPlayersGameStarted(
        [{ user_id: 'a' }, { user_id: 'b' }],
        { id: 'game-1', name: 'X' },
        'cron/start-scheduled-games',
      ),
    ).resolves.toBeUndefined();

    expect(consoleErr).toHaveBeenCalledWith(
      '[cron/start-scheduled-games] game_started notify failed',
      expect.any(Error),
    );
    consoleErr.mockRestore();
  });
});
