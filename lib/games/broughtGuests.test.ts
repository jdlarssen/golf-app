import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';
import {
  readBroughtGuests,
  readBroughtGuestsInGame,
  withdrawBroughtGuests,
  type BroughtGuest,
} from './broughtGuests';

/**
 * Type A (#2607): the guests a player brought follow that player out.
 *
 * The link today is the team sign-up: a guest's request points at the
 * captain's (`team_request_id`). A read failure is never "no guests" (#1445),
 * and both writes check their row count (trap 2).
 */

const GAME = '11111111-1111-1111-1111-111111111111';
const HOST = '22222222-2222-2222-2222-222222222222';
const HOST_REQ = '33333333-3333-3333-3333-333333333333';
const GUEST_A = '44444444-4444-4444-4444-444444444444';
const GUEST_B = '55555555-5555-5555-5555-555555555555';
const MATE = '66666666-6666-6666-6666-666666666666';
const OTHER_HOST = '77777777-7777-7777-7777-777777777777';
const OTHER_HOST_REQ = '88888888-8888-8888-8888-888888888888';

function guestUser(name: string) {
  return { is_guest: true, name, nickname: null, email: `guest+${name}@guest.tornygolf.invalid` };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('readBroughtGuests', () => {
  it('a player who is not a captain has brought nobody', async () => {
    const admin = buildSupabaseMock([{ data: null, error: null }]);

    expect(await readBroughtGuests(admin as never, GAME, HOST)).toEqual({ ok: true, guests: [] });
    expect(admin.__fromCalls.filter((c) => c.method === 'returns')).toHaveLength(0);
  });

  it('only the guests under the captain, with their names and whether they have a place', async () => {
    const admin = buildSupabaseMock([
      { data: { id: HOST_REQ, user_id: HOST }, error: null },
      {
        data: [
          { id: 'req-a', user_id: GUEST_A, status: 'approved', team_request_id: HOST_REQ, users: guestUser('Gunn') },
          { id: 'req-b', user_id: GUEST_B, status: 'pending', team_request_id: HOST_REQ, users: guestUser('Geir') },
          {
            id: 'req-mate',
            user_id: MATE,
            status: 'approved',
            team_request_id: HOST_REQ,
            users: { is_guest: false, name: 'Mette', nickname: null, email: 'mette@example.test' },
          },
        ],
        error: null,
      },
      { data: [{ user_id: GUEST_A }], error: null },
    ]);

    expect(await readBroughtGuests(admin as never, GAME, HOST)).toEqual({
      ok: true,
      guests: [
        { requestId: 'req-a', userId: GUEST_A, name: 'Gunn', status: 'approved', onRoster: true },
        { requestId: 'req-b', userId: GUEST_B, name: 'Geir', status: 'pending', onRoster: false },
      ],
    });

    const filters = admin.__fromCalls.filter((c) => c.method === 'eq' || c.method === 'in').map((c) => c.args);
    // The host's captain request, in this game, without a status filter: a
    // retry after a half-done withdrawal finds it already marked withdrawn.
    expect(filters).toContainEqual(['is_team_captain', true]);
    expect(filters).toContainEqual(['user_id', HOST]);
    // #2440: the children are read inside the game; only live requests.
    expect(filters).toContainEqual(['team_request_id', [HOST_REQ]]);
    expect(filters).toContainEqual(['status', ['pending', 'approved']]);
    expect(filters.filter((a) => a[0] === 'game_id')).toHaveLength(3);
    // The roster is read for the guests only.
    expect(filters).toContainEqual(['user_id', [GUEST_A, GUEST_B]]);
  });

  it('a team with no guests skips the roster read', async () => {
    const admin = buildSupabaseMock([
      { data: { id: HOST_REQ, user_id: HOST }, error: null },
      { data: [], error: null },
    ]);

    expect(await readBroughtGuests(admin as never, GAME, HOST)).toEqual({ ok: true, guests: [] });
    expect(admin.__fromCalls.some((c) => c.table === 'game_players')).toBe(false);
  });

  it.each([
    ['the host lookup', [{ data: null, error: { message: 'boom' } }]],
    [
      'the guests (and their users, embedded)',
      [{ data: { id: HOST_REQ, user_id: HOST }, error: null }, { data: null, error: { message: 'boom' } }],
    ],
    [
      'the roster',
      [
        { data: { id: HOST_REQ, user_id: HOST }, error: null },
        {
          data: [{ id: 'req-a', user_id: GUEST_A, status: 'approved', team_request_id: HOST_REQ, users: guestUser('Gunn') }],
          error: null,
        },
        { data: null, error: { message: 'boom' } },
      ],
    ],
  ])('a failed read of %s → { ok: false }, never "no guests"', async (_label, queue) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const admin = buildSupabaseMock(queue as never);

    expect(await readBroughtGuests(admin as never, GAME, HOST)).toEqual({ ok: false });
  });
});

describe('readBroughtGuestsInGame', () => {
  it('groups every captain\'s guests by the captain, in one read for the game', async () => {
    const admin = buildSupabaseMock([
      {
        data: [
          { id: HOST_REQ, user_id: HOST },
          { id: OTHER_HOST_REQ, user_id: OTHER_HOST },
        ],
        error: null,
      },
      {
        data: [
          { id: 'req-a', user_id: GUEST_A, status: 'approved', team_request_id: HOST_REQ, users: guestUser('Gunn') },
          { id: 'req-b', user_id: GUEST_B, status: 'approved', team_request_id: OTHER_HOST_REQ, users: guestUser('Geir') },
        ],
        error: null,
      },
      { data: [{ user_id: GUEST_A }, { user_id: GUEST_B }], error: null },
    ]);

    const read = await readBroughtGuestsInGame(admin as never, GAME);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.byHost.get(HOST)?.map((g) => g.name)).toEqual(['Gunn']);
    expect(read.byHost.get(OTHER_HOST)?.map((g) => g.name)).toEqual(['Geir']);
    expect(read.byHost.has(MATE)).toBe(false);
  });

  it('a failed read → { ok: false }', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const admin = buildSupabaseMock([{ data: null, error: { message: 'boom' } }]);

    expect(await readBroughtGuestsInGame(admin as never, GAME)).toEqual({ ok: false });
  });
});

describe('withdrawBroughtGuests', () => {
  const seated: BroughtGuest = { requestId: 'req-a', userId: GUEST_A, name: 'Gunn', status: 'approved', onRoster: true };
  const waiting: BroughtGuest = { requestId: 'req-b', userId: GUEST_B, name: 'Geir', status: 'pending', onRoster: false };

  it('no guests → nothing is written', async () => {
    const admin = buildSupabaseMock([]);

    expect(await withdrawBroughtGuests(admin as never, GAME, [], HOST)).toEqual({ ok: true });
    expect(admin.__fromCalls).toHaveLength(0);
  });

  it('deletes the places without an accepted_at filter, then marks the requests withdrawn', async () => {
    const admin = buildSupabaseMock([
      { data: [{ user_id: GUEST_A }], error: null },
      { data: [{ id: 'req-a' }, { id: 'req-b' }], error: null },
    ]);

    expect(await withdrawBroughtGuests(admin as never, GAME, [seated, waiting], HOST)).toEqual({ ok: true });

    const calls = admin.__fromCalls;
    const deleteIdx = calls.findIndex((c) => c.table === 'game_players' && c.method === 'delete');
    const updateIdx = calls.findIndex((c) => c.table === 'game_registration_requests' && c.method === 'update');
    expect(deleteIdx).toBeGreaterThanOrEqual(0);
    expect(updateIdx).toBeGreaterThan(deleteIdx);
    // Only the guest with a place is deleted from the roster.
    expect(calls).toContainEqual({ table: 'game_players', method: 'in', args: ['user_id', [GUEST_A]] });
    // Hole 2: an organiser-confirmed guest (accepted_at set) goes too.
    expect(calls.some((c) => c.table === 'game_players' && c.method === 'is' && c.args[0] === 'accepted_at')).toBe(false);
    expect(calls[updateIdx]!.args[0]).toEqual(
      expect.objectContaining({ status: 'withdrawn', decided_by_user_id: HOST }),
    );
    expect(calls).toContainEqual({
      table: 'game_registration_requests',
      method: 'in',
      args: ['id', ['req-a', 'req-b']],
    });
  });

  it('only pending guests → no roster delete, the requests are still marked', async () => {
    const admin = buildSupabaseMock([{ data: [{ id: 'req-b' }], error: null }]);

    expect(await withdrawBroughtGuests(admin as never, GAME, [waiting], HOST)).toEqual({ ok: true });
    expect(admin.__fromCalls.some((c) => c.table === 'game_players')).toBe(false);
  });

  it.each([
    ['the roster delete matches 0 rows', [{ data: [], error: null }]],
    ['the roster delete fails', [{ data: null, error: { message: 'boom' } }]],
    ['the marking matches 0 rows', [{ data: [{ user_id: GUEST_A }], error: null }, { data: [], error: null }]],
    [
      'the marking matches fewer rows than guests',
      [{ data: [{ user_id: GUEST_A }], error: null }, { data: [{ id: 'req-a' }], error: null }],
    ],
  ])('%s → { ok: false }', async (_label, queue) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const admin = buildSupabaseMock(queue as never);

    expect(await withdrawBroughtGuests(admin as never, GAME, [seated, waiting], HOST)).toEqual({ ok: false });
  });
});
