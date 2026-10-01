import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

/**
 * #2214: when the organiser corrects a side award after the cup is finished,
 * the stored winner (tournaments.winner_team) follows the points. The team
 * points come from getCupSnapshot, mocked at the module boundary: this test is
 * about the sync, not the snapshot's query queue.
 */

vi.mock('server-only', () => ({}));

let adminMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminMock,
}));

const getCupSnapshotMock = vi.fn();
vi.mock('./getCupSnapshot', () => ({
  getCupSnapshot: (...args: unknown[]) => getCupSnapshotMock(...args),
}));

const points = (team1Points: number, team2Points: number) => ({
  leaderboard: { team1Points, team2Points },
});

const updates = () =>
  adminMock.__fromCalls.filter((c) => c.table === 'tournaments' && c.method === 'update');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('syncFinishedCupWinner (#2214)', () => {
  it('a finished cup whose points now favour team 2 gets winner_team 2', async () => {
    adminMock = buildSupabaseMock([
      { data: { status: 'finished', winner_team: 1 }, error: null }, // the cup
      { data: [{ id: 'cup-1' }], error: null }, // update…select('id')
    ]);
    getCupSnapshotMock.mockResolvedValue(points(4.5, 6));

    const { syncFinishedCupWinner } = await import('./finishedCupWinner');
    await syncFinishedCupWinner('cup-1');

    const eqs = adminMock.__fromCalls
      .slice(adminMock.__fromCalls.indexOf(updates()[0]))
      .filter((c) => c.method === 'eq')
      .map((c) => c.args);
    expect({ patch: updates()[0]?.args[0], eqs }).toEqual({
      patch: { winner_team: 2 },
      eqs: [
        ['id', 'cup-1'],
        ['status', 'finished'],
      ],
    });
  });

  it('a tied cup that is turned gets a winner', async () => {
    adminMock = buildSupabaseMock([
      { data: { status: 'finished', winner_team: null }, error: null },
      { data: [{ id: 'cup-1' }], error: null },
    ]);
    getCupSnapshotMock.mockResolvedValue(points(6, 5));

    const { syncFinishedCupWinner } = await import('./finishedCupWinner');
    await syncFinishedCupWinner('cup-1');

    expect(updates()[0]?.args[0]).toEqual({ winner_team: 1 });
  });

  it('writes nothing when the winner is unchanged', async () => {
    adminMock = buildSupabaseMock([{ data: { status: 'finished', winner_team: 1 }, error: null }]);
    getCupSnapshotMock.mockResolvedValue(points(5.5, 5));

    const { syncFinishedCupWinner } = await import('./finishedCupWinner');
    await syncFinishedCupWinner('cup-1');

    expect(updates()).toHaveLength(0);
  });

  it('an active cup: no snapshot read and no write', async () => {
    adminMock = buildSupabaseMock([{ data: { status: 'active', winner_team: null }, error: null }]);

    const { syncFinishedCupWinner } = await import('./finishedCupWinner');
    await syncFinishedCupWinner('cup-1');

    expect({ snapshots: getCupSnapshotMock.mock.calls.length, writes: updates().length }).toEqual({
      snapshots: 0,
      writes: 0,
    });
  });

  it('throws when the write touches no row', async () => {
    adminMock = buildSupabaseMock([
      { data: { status: 'finished', winner_team: 1 }, error: null },
      { data: [], error: null }, // 0 rows: the cup changed under us
    ]);
    getCupSnapshotMock.mockResolvedValue(points(4.5, 6));

    const { syncFinishedCupWinner } = await import('./finishedCupWinner');
    await expect(syncFinishedCupWinner('cup-1')).rejects.toThrow();
  });

  it('throws when the cup read fails', async () => {
    adminMock = buildSupabaseMock([{ data: null, error: { message: 'boom' } }]);

    const { syncFinishedCupWinner } = await import('./finishedCupWinner');
    await expect(syncFinishedCupWinner('cup-1')).rejects.toThrow();
  });
});
