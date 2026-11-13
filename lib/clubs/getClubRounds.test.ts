import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recordingClient, type QueryCall } from '@/tests/queryBuilderMock';

// Type A: the club page's rounds read (#2326). The real `getUpcomingClubGames`
// and `buildClubRoundEntries` run; the boundaries are the service-role client
// (club rounds), the request client (your own game_players rows) and the two
// best-effort helpers. A failed read of the rounds or of your rows must give
// `ok: false` (#2490), never an empty list.

const ROUND = {
  id: 'g1',
  name: 'Onsdagsgolfen',
  short_id: 'rnd00001',
  scheduled_tee_off_at: '2026-10-08T15:30:00Z',
  registration_mode: 'invite_only',
  status: 'scheduled',
  signups_closed_at: null,
  created_by: 'someone',
  group_id: 'club-1',
  game_mode: 'stableford',
  mode_config: { kind: 'stableford', team_size: 1, points_table: 'standard' },
  hole_segment: 'full',
  start_type: 'first_tee',
  courses: { name: 'Byneset North' },
  groups: { name: 'Byneset GK' },
};

let roundsResult: { data: unknown; error: unknown } = { data: [], error: null };
let mineResult: { data: unknown; error: unknown } = { data: [], error: null };

const admin = recordingClient(() => roundsResult);
const request = recordingClient(() => mineResult);
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => admin.client }));
vi.mock('@/lib/games/getGameSocialProof', () => ({
  getGamesSocialProof: vi.fn(async () => ({
    g1: { joinedCount: 3, knownFriendNames: [], knownFriendOverflow: 0 },
  })),
}));
vi.mock('@/lib/games/getRegistrationSeats', () => ({
  getRegistrationSeats: vi.fn(async () => new Map()),
}));

const { getClubRounds } = await import('./getClubRounds');

const NOW = new Date('2026-10-01T10:00:00Z');
const call = (calls: QueryCall[], method: string, column: string) =>
  calls.find((c) => c[0] === method && c[1] === column)?.[2];

beforeEach(() => {
  roundsResult = { data: [ROUND], error: null };
  mineResult = { data: [], error: null };
  admin.reset();
  request.reset();
});

const read = () =>
  getClubRounds(request.client as never, 'club-1', 'me', NOW);

describe('getClubRounds', () => {
  it('reads the club\'s scheduled rounds and your own live rows on them', async () => {
    mineResult = { data: [{ game_id: 'g1' }], error: null };
    const res = await read();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.entries.map((e) => [e.id, e.mine])).toEqual([['g1', 'joined']]);
    expect(res.socialProof.g1).toEqual({ joinedCount: 3, knownFriendNames: [], knownFriendOverflow: 0 });

    const [rounds] = admin.queries;
    expect(call(rounds, 'in', 'group_id')).toEqual(['club-1']);
    expect(call(rounds, 'eq', 'status')).toBe('scheduled');

    const [mine] = request.queries;
    expect(mine[0]).toEqual(['from', 'game_players']);
    expect(call(mine, 'eq', 'user_id')).toBe('me');
    expect(call(mine, 'is', 'withdrawn_at')).toBeNull();
    expect(call(mine, 'in', 'game_id')).toEqual(['g1']);
  });

  it('gives ok: false when the rounds read fails', async () => {
    roundsResult = { data: null, error: { message: 'boom' } };
    expect(await read()).toEqual({ ok: false });
  });

  it('gives ok: false when your own rows fail', async () => {
    mineResult = { data: null, error: { message: 'boom' } };
    expect(await read()).toEqual({ ok: false });
  });

  it('is an empty list, without reading your rows, when the club has no rounds', async () => {
    roundsResult = { data: [], error: null };
    expect(await read()).toEqual({ ok: true, entries: [], socialProof: {} });
    expect(request.queries).toHaveLength(0);
  });
});
