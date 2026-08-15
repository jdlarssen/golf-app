// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Type A (#1524): to-fase-orkestreringen i sweepen (#1450) — flipp alle
 * forfalte spill først, DERETTER ett varsel-pass. Utvelgelsen av hvilket spill
 * hver spiller varsles om er Type A i
 * `lib/notifications/startNotificationTargets.test.ts` og re-asserteres ikke
 * her; selektoren kjøres ekte gjennom ruta så koblingen er bevist.
 */

const dueReturnsMock = vi.fn<
  (...args: unknown[]) => Promise<{ data: unknown; error: unknown }>
>();
/** gameId → aktiv tropp, slik `from('game_players')`-oppslaget ser den. */
const rosters = new Map<string, { user_id: string }[]>();

// Supabase-kjedene ruta faktisk bruker:
//   games:        select().eq().lte().gte().returns()
//   game_players: select().eq('game_id', id).is().returns()
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      if (table === 'games') {
        return {
          select: () => ({
            eq: () => ({
              lte: () => ({ gte: () => ({ returns: dueReturnsMock }) }),
            }),
          }),
        };
      }
      if (table === 'game_players') {
        return {
          select: () => ({
            eq: (_column: string, gameId: string) => ({
              is: () => ({
                returns: () =>
                  Promise.resolve({
                    data: rosters.get(gameId) ?? [],
                    error: null,
                  }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected from(${table}) call`);
    },
  }),
}));

vi.mock('@/lib/games/startScheduledGame', () => ({
  startScheduledGame: vi.fn(),
}));
vi.mock('@/lib/games/syncDerivedGamesStatus', () => ({
  startDerivedGames: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/notifications/events', () => ({
  notifyPlayersGameStarted: vi.fn().mockResolvedValue(undefined),
}));
// Behold den ekte `isStructuralBlockReason` (ren regel) — kun varsel-IO stubbes.
vi.mock('@/lib/notifications/autoStartBlocked', async (importActual) => {
  const actual =
    await importActual<typeof import('@/lib/notifications/autoStartBlocked')>();
  return {
    ...actual,
    maybeNotifyAutoStartBlocked: vi.fn().mockResolvedValue(undefined),
  };
});
// revalidateTag kaster utenfor Next-runtime.
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));

import { NextRequest } from 'next/server';
import { startScheduledGame } from '@/lib/games/startScheduledGame';
import { startDerivedGames } from '@/lib/games/syncDerivedGamesStatus';
import { notifyPlayersGameStarted } from '@/lib/notifications/events';
import { POST } from './route';

const startScheduledGameMock = vi.mocked(startScheduledGame);
const startDerivedGamesMock = vi.mocked(startDerivedGames);
const notifyStartedMock = vi.mocked(notifyPlayersGameStarted);

type DueRow = {
  id: string;
  name: string;
  created_by: string | null;
  tournament_id: string | null;
  hole_segment: 'front9' | 'full' | 'back9';
  source_game_id: string | null;
};

function dueGame(overrides: Partial<DueRow> & { id: string }): DueRow {
  return {
    name: `Runde ${overrides.id}`,
    created_by: 'admin-1',
    tournament_id: null,
    hole_segment: 'full',
    source_game_id: null,
    ...overrides,
  };
}

function cronRequest() {
  return new NextRequest('http://localhost/api/cron/start-scheduled-games', {
    method: 'POST',
    headers: { authorization: 'Bearer test-secret' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  rosters.clear();
  process.env.CRON_SECRET = 'test-secret';
  dueReturnsMock.mockResolvedValue({ data: [], error: null });
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe('POST /api/cron/start-scheduled-games', () => {
  it('splittet cup-dag: fire startede spill gir nøyaktig ett varsel, på vert-spillet', async () => {
    // #1441: greensome (front9, vert), best ball (back9, vert) og to avledede
    // singles — samme fire spillere, samme cup, samme minutt.
    const players = [{ user_id: 'p1' }, { user_id: 'p2' }, { user_id: 'p3' }, { user_id: 'p4' }];
    rosters.set('g-front', players);
    rosters.set('g-back', players);
    dueReturnsMock.mockResolvedValue({
      data: [
        dueGame({ id: 'g-back', tournament_id: 'cup-1', hole_segment: 'back9' }),
        dueGame({ id: 'g-d1', tournament_id: 'cup-1', hole_segment: 'back9', source_game_id: 'g-back' }),
        dueGame({ id: 'g-front', tournament_id: 'cup-1', hole_segment: 'front9' }),
        dueGame({ id: 'g-d2', tournament_id: 'cup-1', hole_segment: 'back9', source_game_id: 'g-back' }),
      ],
      error: null,
    });
    startScheduledGameMock.mockResolvedValue({ ok: true, started: true });

    const res = await POST(cronRequest());

    expect(notifyStartedMock).toHaveBeenCalledTimes(1);
    expect(notifyStartedMock.mock.calls[0][1].id).toBe('g-front');
    expect(notifyStartedMock.mock.calls[0][0]).toEqual(players);
    // Hver vunnet flipp drar med seg sine avledede spill.
    expect(startDerivedGamesMock).toHaveBeenCalledTimes(4);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      checked: 4,
      started: ['g-back', 'g-d1', 'g-front', 'g-d2'],
    });
  });

  it('en annen start-vei vant flippen (started:false) → ingen varsel', async () => {
    rosters.set('g1', [{ user_id: 'p1' }]);
    dueReturnsMock.mockResolvedValue({ data: [dueGame({ id: 'g1' })], error: null });
    startScheduledGameMock.mockResolvedValue({ ok: true, started: false });

    const res = await POST(cronRequest());

    expect(notifyStartedMock).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toMatchObject({ ok: true, started: [] });
  });

  it('kast midt i løkka varsler fortsatt spillene som rakk å starte (finally)', async () => {
    rosters.set('g1', [{ user_id: 'p1' }]);
    rosters.set('g2', [{ user_id: 'p2' }]);
    dueReturnsMock.mockResolvedValue({
      data: [dueGame({ id: 'g1' }), dueGame({ id: 'g2' })],
      error: null,
    });
    startScheduledGameMock
      .mockResolvedValueOnce({ ok: true, started: true })
      .mockRejectedValueOnce(new Error('boom'));

    await expect(POST(cronRequest())).rejects.toThrow('boom');

    expect(notifyStartedMock).toHaveBeenCalledTimes(1);
    expect(notifyStartedMock.mock.calls[0][1].id).toBe('g1');
  });
});
