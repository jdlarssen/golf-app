import { beforeEach, describe, expect, it, vi } from 'vitest';

// #2283 (part D2) — Type A: the two write paths for the side contests. Only the
// Supabase client is mocked (the system boundary): `getUser` for the session and
// `rpc` for the two functions of 0237.
const getUserMock = vi.fn();
const rpcMock = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => ({
    auth: { getUser: getUserMock },
    rpc: rpcMock,
  }),
}));

import { recordGirClaims, recordSideClaim } from './sideClaimActions';

const GAME = '11111111-1111-4111-8111-111111111111';
const PLAYER_A = '22222222-2222-4222-8222-222222222222';
const PLAYER_B = '33333333-3333-4333-8333-333333333333';

const SIDE = { gameId: GAME, category: 'closest_to_pin', holeNumber: 7, winnerUserId: PLAYER_A, distanceM: 2.4 } as const;
const GIR = { gameId: GAME, holeNumber: 7, userIds: [PLAYER_A], hit: true };

beforeEach(() => {
  getUserMock.mockReset();
  rpcMock.mockReset();
  getUserMock.mockResolvedValue({ data: { user: { id: PLAYER_B } }, error: null });
  rpcMock.mockResolvedValue({ data: 'ok', error: null });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('recordSideClaim', () => {
  it('calls record_side_claim with the rpc argument names and answers ok', async () => {
    expect(await recordSideClaim(SIDE)).toEqual({ ok: true });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('record_side_claim', {
      p_game_id: GAME,
      p_category: 'closest_to_pin',
      p_hole_number: 7,
      p_winner_user_id: PLAYER_A,
      p_distance_m: 2.4,
    });
  });

  it('sends «Ingen på green» as a null winner and null distance', async () => {
    await recordSideClaim({ ...SIDE, category: 'longest_drive', winnerUserId: null, distanceM: null });
    expect(rpcMock.mock.calls[0][1]).toMatchObject({
      p_category: 'longest_drive',
      p_winner_user_id: null,
      p_distance_m: null,
    });
  });

  it('sends the distance as the rounded value the rpc stores', async () => {
    await recordSideClaim({ ...SIDE, distanceM: 2.45 });
    // 2,45 rounds to 2,5 the way `round(x, 1)` does in the rpc.
    expect(rpcMock.mock.calls[0][1]).toMatchObject({ p_distance_m: 2.5 });
  });

  it.each(['not_player', 'not_active', 'no_slot', 'wrong_flight', 'bad_distance'])(
    'hands the rpc answer %s on as the error',
    async (code) => {
      rpcMock.mockResolvedValue({ data: code, error: null });
      expect(await recordSideClaim(SIDE)).toEqual({ ok: false, error: code });
    },
  );

  // Trap 2: the rpc answers through `data`; anything but 'ok' wrote nothing.
  it.each<[string, { data: unknown; error: unknown }]>([
    ['a null answer', { data: null, error: null }],
    ['an empty answer', { data: [], error: null }],
    ['an answer we do not know', { data: 'wrote_some', error: null }],
    ['an rpc error', { data: null, error: { message: 'boom' } }],
  ])('is not ok for %s', async (_label, answer) => {
    rpcMock.mockResolvedValue(answer);
    expect(await recordSideClaim(SIDE)).toEqual({ ok: false, error: 'db_error' });
  });

  it('is db_error when the request throws', async () => {
    rpcMock.mockRejectedValue(new Error('fetch failed'));
    expect(await recordSideClaim(SIDE)).toEqual({ ok: false, error: 'db_error' });
  });

  it('is not_authenticated without a session, and never calls the rpc', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    expect(await recordSideClaim(SIDE)).toEqual({ ok: false, error: 'not_authenticated' });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  // The payload is refused before the rpc, with the code the rpc itself would have answered.
  it.each<[string, Record<string, unknown>, string]>([
    ['a game id that is no uuid', { gameId: 'not-a-uuid' }, 'not_player'],
    ['an unknown category', { category: 'gir' }, 'no_slot'],
    ['an unknown category, as a column name', { category: 'entered_by' }, 'no_slot'],
    ['hole 0', { holeNumber: 0 }, 'no_slot'],
    ['hole 19', { holeNumber: 19 }, 'no_slot'],
    ['a hole with a fraction', { holeNumber: 7.5 }, 'no_slot'],
    ['a hole sent as text', { holeNumber: '7' }, 'no_slot'],
    ['a winner that is no uuid', { winnerUserId: 'Tore' }, 'wrong_flight'],
    ['a winner sent as a number', { winnerUserId: 7 }, 'wrong_flight'],
    ['a distance of 0', { distanceM: 0 }, 'bad_distance'],
    ['a negative distance', { distanceM: -2 }, 'bad_distance'],
    ['a distance over 99,9', { distanceM: 100 }, 'bad_distance'],
    ['a distance that is not a number', { distanceM: Number.NaN }, 'bad_distance'],
    ['a distance sent as text', { distanceM: '2,4' }, 'bad_distance'],
    ['a distance with many decimals', { distanceM: 2.449999999 }, 'bad_distance'],
  ])('refuses %s before the rpc', async (_label, patch, code) => {
    expect(await recordSideClaim({ ...SIDE, ...patch } as never)).toEqual({ ok: false, error: code });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('refuses a missing payload instead of throwing', async () => {
    expect(await recordSideClaim(undefined as never)).toEqual({ ok: false, error: 'not_player' });
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe('recordGirClaims', () => {
  it('calls record_gir_claims with the rpc argument names and answers ok', async () => {
    expect(await recordGirClaims({ ...GIR, userIds: [PLAYER_A, PLAYER_B] })).toEqual({ ok: true });
    expect(rpcMock).toHaveBeenCalledWith('record_gir_claims', {
      p_game_id: GAME,
      p_hole_number: 7,
      p_user_ids: [PLAYER_A, PLAYER_B],
      p_hit: true,
    });
  });

  it('sends a miss as hit: false', async () => {
    await recordGirClaims({ ...GIR, hit: false });
    expect(rpcMock.mock.calls[0][1]).toMatchObject({ p_hit: false });
  });

  it.each(['not_player', 'not_active', 'no_slot', 'wrong_flight', 'bad_distance'])(
    'hands the rpc answer %s on as the error',
    async (code) => {
      rpcMock.mockResolvedValue({ data: code, error: null });
      expect(await recordGirClaims(GIR)).toEqual({ ok: false, error: code });
    },
  );

  it.each<[string, { data: unknown; error: unknown }]>([
    ['a null answer', { data: null, error: null }],
    ['an empty answer', { data: [], error: null }],
    ['an answer we do not know', { data: 'wrote_some', error: null }],
    ['an rpc error', { data: null, error: { message: 'boom' } }],
  ])('is not ok for %s', async (_label, answer) => {
    rpcMock.mockResolvedValue(answer);
    expect(await recordGirClaims(GIR)).toEqual({ ok: false, error: 'db_error' });
  });

  it('is db_error when the request throws', async () => {
    rpcMock.mockRejectedValue(new Error('fetch failed'));
    expect(await recordGirClaims(GIR)).toEqual({ ok: false, error: 'db_error' });
  });

  it('is not_authenticated without a session, and never calls the rpc', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    expect(await recordGirClaims(GIR)).toEqual({ ok: false, error: 'not_authenticated' });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it.each<[string, Record<string, unknown>, string]>([
    ['a game id that is no uuid', { gameId: '1' }, 'not_player'],
    ['hole 0', { holeNumber: 0 }, 'no_slot'],
    ['hole 19', { holeNumber: 19 }, 'no_slot'],
    ['an empty list of players', { userIds: [] }, 'wrong_flight'],
    ['players that are no list', { userIds: PLAYER_A }, 'wrong_flight'],
    ['a player that is no uuid', { userIds: [PLAYER_A, 'Tore'] }, 'wrong_flight'],
    ['a null among the players', { userIds: [PLAYER_A, null] }, 'wrong_flight'],
    ['a hit that is no boolean', { hit: 'true' }, 'db_error'],
    ['a missing hit', { hit: undefined }, 'db_error'],
  ])('refuses %s before the rpc', async (_label, patch, code) => {
    expect(await recordGirClaims({ ...GIR, ...patch } as never)).toEqual({ ok: false, error: code });
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
