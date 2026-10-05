import { beforeEach, describe, expect, it, vi } from 'vitest';

// Type A for the Klubbhus room's cup rows (#2493): which cups get a snapshot,
// what a failed snapshot does, and whether you play or only organise. The
// three reads behind it are the boundary: `getMyCupIds`, the service-role
// status read, and `getCupSnapshot`.
const getMyCupIds = vi.fn();
vi.mock('./myCups', () => ({ getMyCupIds }));

const getCupSnapshot = vi.fn();
vi.mock('./getCupSnapshot', () => ({ getCupSnapshot }));

const adminCalls: unknown[][] = [];
let tournaments: { data: unknown[] | null; error: unknown } = { data: [], error: null };
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => {
    const b: Record<string, unknown> = {};
    for (const m of ['from', 'select', 'in', 'order', 'returns']) {
      b[m] = (...args: unknown[]) => (adminCalls.push([m, ...args]), b);
    }
    b.then = (resolve: (v: unknown) => unknown) => resolve(tournaments);
    return b;
  },
}));

const { getRoomCups } = await import('./getRoomCups');

const supabase = {} as Parameters<typeof getRoomCups>[0];
const cup = (id: string, status: 'draft' | 'active' | 'finished') => ({
  id,
  name: `Cup ${id}`,
  status,
  created_by: 'someone',
  group_id: null,
});
const snapshot = (finishedMatches: number, remainingMatches: number) => ({
  leaderboard: { finishedMatches, remainingMatches },
});

beforeEach(() => {
  getMyCupIds.mockReset();
  getCupSnapshot.mockReset();
  adminCalls.length = 0;
  tournaments = { data: [], error: null };
});

describe('getRoomCups', () => {
  it('reads status first and builds a snapshot only for cups that are not finished (15b)', async () => {
    getMyCupIds.mockResolvedValue({ ok: true, ids: ['a', 'f'], playing: ['a', 'f'] });
    tournaments = { data: [cup('a', 'active'), cup('f', 'finished')], error: null };
    getCupSnapshot.mockResolvedValue(snapshot(1, 2));

    const res = await getRoomCups(supabase, 'me', 'Ukjent');

    expect(adminCalls).toContainEqual(['in', 'id', ['a', 'f']]);
    expect(getCupSnapshot).toHaveBeenCalledTimes(1);
    expect(getCupSnapshot).toHaveBeenCalledWith('a', 'Ukjent');
    expect(res).toEqual({
      ok: true,
      finishedCount: 1,
      live: [{ id: 'a', name: 'Cup a', created_by: 'someone', group_id: null, playing: true, progress: { played: 1, total: 3 } }],
    });
  });

  it('a snapshot that fails marks that cup alone; the others keep their numbers (#2490)', async () => {
    getMyCupIds.mockResolvedValue({ ok: true, ids: ['a1', 'a2'], playing: ['a1', 'a2'] });
    tournaments = { data: [cup('a1', 'active'), cup('a2', 'draft')], error: null };
    getCupSnapshot.mockImplementation(async (id: string) => {
      if (id === 'a2') throw new Error('boom');
      return snapshot(3, 5);
    });

    const res = await getRoomCups(supabase, 'me', 'Ukjent');

    expect(res.ok && res.live.map((c) => [c.id, c.progress])).toEqual([
      ['a1', { played: 3, total: 8 }],
      ['a2', null],
    ]);
  });

  it('tells a cup you play in from one you only organise', async () => {
    getMyCupIds.mockResolvedValue({ ok: true, ids: ['mine', 'theirs'], playing: ['theirs'] });
    tournaments = { data: [cup('mine', 'active'), cup('theirs', 'active')], error: null };
    getCupSnapshot.mockResolvedValue(snapshot(0, 0));

    const res = await getRoomCups(supabase, 'me', 'Ukjent');

    expect(res.ok && res.live.map((c) => [c.id, c.playing])).toEqual([
      ['mine', false],
      ['theirs', true],
    ]);
  });

  it('no cups: no status read, no snapshots', async () => {
    getMyCupIds.mockResolvedValue({ ok: true, ids: [], playing: [] });
    await expect(getRoomCups(supabase, 'me', 'Ukjent')).resolves.toEqual({ ok: true, live: [], finishedCount: 0 });
    expect(adminCalls).toEqual([]);
    expect(getCupSnapshot).not.toHaveBeenCalled();
  });

  it.each([
    ['the cup ids', () => getMyCupIds.mockResolvedValue({ ok: false })],
    [
      'the status',
      () => {
        getMyCupIds.mockResolvedValue({ ok: true, ids: ['a'], playing: ['a'] });
        tournaments = { data: null, error: { message: 'boom' } };
      },
    ],
  ])('a failed read of %s fails the section (#2490)', async (_label, arrange) => {
    arrange();
    await expect(getRoomCups(supabase, 'me', 'Ukjent')).resolves.toEqual({ ok: false });
    expect(getCupSnapshot).not.toHaveBeenCalled();
  });
});
