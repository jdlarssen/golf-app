// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAdminClientMock } from '@/lib/supabase/testing/adminClientMock';
import type { SharedRound } from '@/lib/friends/getSharedRounds';

/**
 * Type A (#2381): the gate in front of the friend page's rounds. The read
 * behind it uses the admin client on another player's rows, so the friend
 * check here is the privacy. `readFriendIds` is real, over the admin double;
 * `getSharedRounds` has its own suite.
 *
 * What must hold: no token reaches nothing; only an accepted friend gets
 * rounds (not a pending request, not yourself); the caller is always the
 * token's user; and a failed friend lookup is 500, never 403 or 200.
 */

const ME = 'meg-selv';
const KARI = 'kari';
const OLA = 'ola';
const TOKEN = 'token-meg';

let friendships: Record<string, unknown>[] = [];
let friendshipError: { message: string } | null = null;

const fake = createAdminClientMock({
  tokens: { [TOKEN]: ME },
  respond: (op) => {
    if (op.table === 'friendships') return { data: friendships, error: friendshipError };
    throw new Error(`uventet spørring: ${op.kind} ${op.table}`);
  },
});
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));

const sharedRoundsMock = vi.fn<(userId: string, otherId: string) => Promise<SharedRound[]>>();
vi.mock('@/lib/friends/getSharedRounds', () => ({
  getSharedRounds: (userId: string, otherId: string) => sharedRoundsMock(userId, otherId),
}));

import { NextRequest } from 'next/server';
import { GET } from './route';

function get(id: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token !== undefined) headers.authorization = `Bearer ${token}`;
  return GET(new NextRequest(`http://localhost/api/friends/${id}/rounds`, { headers }), {
    params: Promise.resolve({ id }),
  });
}

const ROUNDS: SharedRound[] = [
  { gameId: 'g1', name: 'Onsdagsgolfen', playedAt: '2026-09-23T15:00:00Z', modeLabel: 'Slagspill', badge: 'you_ahead' },
  { gameId: 'g2', name: 'Lagmøtet', playedAt: '2026-08-10T16:00:00Z', modeLabel: 'Texas scramble', badge: 'same_team' },
  { gameId: 'g3', name: 'Vinterligaen', playedAt: '2026-08-01T12:00:00Z', modeLabel: 'Slagspill', badge: null },
  { gameId: 'g4', name: 'Fredagsrunden', playedAt: '2026-07-01T12:00:00Z', modeLabel: 'Slagspill', badge: 'tied' },
  { gameId: 'g5', name: 'Sommercupen', playedAt: null, modeLabel: 'Singel matchplay', badge: 'them_ahead' },
];

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  friendshipError = null;
  friendships = [
    { id: 'f1', requester_id: ME, addressee_id: KARI, status: 'accepted' },
    { id: 'f2', requester_id: OLA, addressee_id: ME, status: 'pending' },
  ];
  sharedRoundsMock.mockResolvedValue(ROUNDS);
});

describe('GET /api/friends/[id]/rounds', () => {
  it('is 401 without a token and reads nothing', async () => {
    const res = await get(KARI);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    expect(fake.ops).toHaveLength(0);
    expect(sharedRoundsMock).not.toHaveBeenCalled();
  });

  it('is 401 with a token nobody holds', async () => {
    const res = await get(KARI, 'falsk');
    expect(res.status).toBe(401);
    expect(sharedRoundsMock).not.toHaveBeenCalled();
  });

  it.each([
    ['someone who is not a friend', 'per'],
    ['a pending request', OLA],
    ['yourself', ME],
  ])('is 403 for %s and reads none of their rounds', async (_label, id) => {
    const res = await get(id, TOKEN);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'not_friends' });
    expect(sharedRoundsMock).not.toHaveBeenCalled();
  });

  it('is 403 for yourself even if a row named you as your own friend', async () => {
    friendships = [{ id: 'f9', requester_id: ME, addressee_id: ME, status: 'accepted' }];
    const res = await get(ME, TOKEN);
    expect(res.status).toBe(403);
    expect(sharedRoundsMock).not.toHaveBeenCalled();
  });

  it('gives a friend the rounds and the record in the WIRE shape', async () => {
    const res = await get(KARI, TOKEN);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(['record', 'rounds']);
    expect(body.rounds).toEqual(ROUNDS);
    // same_team and the unplaced league flight are not played against each other.
    expect(body.record).toEqual({ played: 3, youAhead: 1, themAhead: 1, tied: 1 });
  });

  it('takes the caller from the token, never from the address', async () => {
    await get(KARI, TOKEN);
    expect(sharedRoundsMock).toHaveBeenCalledWith(ME, KARI);
    const lookup = fake.ops.find((op) => op.table === 'friendships');
    expect(lookup?.filters).toContainEqual({ op: 'eq', column: 'status', value: 'accepted' });
    expect(String(lookup?.filters.find((f) => f.op === 'or')?.value)).toContain(ME);
    expect(String(lookup?.filters.find((f) => f.op === 'or')?.value)).not.toContain(KARI);
  });

  it('is 500 when the friend lookup fails, never 403 or 200', async () => {
    friendshipError = { message: 'boom' };
    const res = await get(KARI, TOKEN);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'load_failed' });
    expect(sharedRoundsMock).not.toHaveBeenCalled();
  });

  it('is 500 when the rounds cannot be read', async () => {
    sharedRoundsMock.mockRejectedValue(new Error('boom'));
    const res = await get(KARI, TOKEN);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'load_failed' });
  });
});
