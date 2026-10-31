import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';
import { readBroughtGuests, readBroughtGuestsInGame, readMyBroughtGuest } from './broughtGuests';

/**
 * Type A (#2607): which guests a player brought, read for the screens that say
 * so before anyone leaves. The withdrawal itself is the trigger in 0229
 * (tested in supabase/tests/guests_follow_their_host_test.sql).
 *
 * Two links: the team sign-up (a guest's request points at the captain's,
 * `team_request_id`) and «Ta med en gjest» (phase 2, 0230: the guest's
 * `brought_by_user_id` is the player). A read failure is never "no guests"
 * (#1445).
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
  it('a player who is neither a captain nor a host has brought nobody', async () => {
    const admin = buildSupabaseMock([{ data: null, error: null }, { data: [], error: null }]);

    expect(await readBroughtGuests(admin as never, GAME, HOST)).toEqual({ ok: true, guests: [] });
    // No captaincy: no read of team children, only the brought_by read.
    expect(admin.__fromCalls.filter((c) => c.method === 'returns')).toHaveLength(1);
  });

  it('phase 2: the guest a player brought alone, read on brought_by_user_id in this game', async () => {
    const admin = buildSupabaseMock([
      { data: null, error: null },
      {
        data: [
          { id: 'req-h', user_id: GUEST_A, status: 'pending', brought_by_user_id: HOST, users: guestUser('Hilde') },
          // A row with an account under brought_by is not a guest (the guard
          // refuses it; a stale embed must not name it).
          {
            id: 'req-x',
            user_id: MATE,
            status: 'approved',
            brought_by_user_id: HOST,
            users: { is_guest: false, name: 'Mette', nickname: null, email: 'mette@example.test' },
          },
        ],
        error: null,
      },
    ]);

    expect(await readBroughtGuests(admin as never, GAME, HOST)).toEqual({
      ok: true,
      guests: [{ requestId: 'req-h', userId: GUEST_A, name: 'Hilde', status: 'pending' }],
    });
    const filters = admin.__fromCalls.filter((c) => c.method === 'eq' || c.method === 'in').map((c) => c.args);
    expect(filters).toContainEqual(['brought_by_user_id', HOST]);
    expect(filters).toContainEqual(['status', ['pending', 'approved']]);
    expect(filters.filter((a) => a[0] === 'game_id')).toHaveLength(2);
  });

  it('a captain who also has a brought guest: both links', async () => {
    const admin = buildSupabaseMock([
      { data: { id: HOST_REQ, user_id: HOST }, error: null },
      {
        data: [{ id: 'req-a', user_id: GUEST_A, status: 'approved', team_request_id: HOST_REQ, users: guestUser('Gunn') }],
        error: null,
      },
      {
        data: [{ id: 'req-h', user_id: GUEST_B, status: 'approved', brought_by_user_id: HOST, users: guestUser('Hilde') }],
        error: null,
      },
    ]);

    const read = await readBroughtGuests(admin as never, GAME, HOST);
    expect(read.ok && read.guests.map((g) => g.name)).toEqual(['Gunn', 'Hilde']);
  });

  it('only the guests under the captain, with their names', async () => {
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
    ]);

    expect(await readBroughtGuests(admin as never, GAME, HOST)).toEqual({
      ok: true,
      guests: [
        { requestId: 'req-a', userId: GUEST_A, name: 'Gunn', status: 'approved' },
        { requestId: 'req-b', userId: GUEST_B, name: 'Geir', status: 'pending' },
      ],
    });

    const filters = admin.__fromCalls.filter((c) => c.method === 'eq' || c.method === 'in').map((c) => c.args);
    // The host's captain request, in this game, whatever its status.
    expect(filters).toContainEqual(['is_team_captain', true]);
    expect(filters).toContainEqual(['user_id', HOST]);
    // #2440: the children are read inside the game; only live requests.
    expect(filters).toContainEqual(['team_request_id', [HOST_REQ]]);
    expect(filters).toContainEqual(['status', ['pending', 'approved']]);
    // Host lookup, team children, brought_by: all three in this game.
    expect(filters.filter((a) => a[0] === 'game_id')).toHaveLength(3);
  });

  it.each([
    ['the host lookup', [{ data: null, error: { message: 'boom' } }]],
    [
      'the guests (and their users, embedded)',
      [{ data: { id: HOST_REQ, user_id: HOST }, error: null }, { data: null, error: { message: 'boom' } }],
    ],
    [
      'the brought guests',
      [{ data: null, error: null }, { data: null, error: { message: 'boom' } }],
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
    ]);

    const read = await readBroughtGuestsInGame(admin as never, GAME);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.byHost.get(HOST)?.map((g) => g.name)).toEqual(['Gunn']);
    expect(read.byHost.get(OTHER_HOST)?.map((g) => g.name)).toEqual(['Geir']);
    expect(read.byHost.has(MATE)).toBe(false);
  });

  it('phase 2: the brought guests join the captains\' under their hosts', async () => {
    const admin = buildSupabaseMock([
      { data: [{ id: HOST_REQ, user_id: HOST }], error: null },
      {
        data: [{ id: 'req-a', user_id: GUEST_A, status: 'approved', team_request_id: HOST_REQ, users: guestUser('Gunn') }],
        error: null,
      },
      {
        data: [{ id: 'req-h', user_id: GUEST_B, status: 'pending', brought_by_user_id: OTHER_HOST, users: guestUser('Hilde') }],
        error: null,
      },
    ]);

    const read = await readBroughtGuestsInGame(admin as never, GAME);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.byHost.get(HOST)?.map((g) => g.name)).toEqual(['Gunn']);
    expect(read.byHost.get(OTHER_HOST)?.map((g) => g.name)).toEqual(['Hilde']);
    // Every brought guest in the game: brought_by_user_id is not null.
    expect(admin.__fromCalls.filter((c) => c.method === 'not').map((c) => c.args)).toContainEqual([
      'brought_by_user_id',
      'is',
      null,
    ]);
  });

  it.each([
    ['the captains', [{ data: null, error: { message: 'boom' } }]],
    ['the brought guests', [{ data: [], error: null }, { data: null, error: { message: 'boom' } }]],
  ])('a failed read of %s → { ok: false }', async (_label, queue) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const admin = buildSupabaseMock(queue as never);

    expect(await readBroughtGuestsInGame(admin as never, GAME)).toEqual({ ok: false });
  });
});

describe('readMyBroughtGuest', () => {
  it('no live brought guest → guest: null', async () => {
    const admin = buildSupabaseMock([{ data: [], error: null }]);
    expect(await readMyBroughtGuest(admin as never, GAME, HOST)).toEqual({ ok: true, guest: null });
  });

  it.each([
    [{ gender: 'ladies', level: 'normal' }, 'D'],
    [{ gender: 'mens', level: 'normal' }, 'M'],
    [{ gender: null, level: 'junior' }, 'J'],
  ] as const)('the guest with handicap and tee category (%o → %s)', async (profile, tee) => {
    const admin = buildSupabaseMock([
      {
        data: [
          {
            id: 'req-h',
            user_id: GUEST_A,
            status: 'approved',
            users: { ...guestUser('Hilde Moen'), hcp_index: 24.6, ...profile },
          },
        ],
        error: null,
      },
    ]);

    expect(await readMyBroughtGuest(admin as never, GAME, HOST)).toEqual({
      ok: true,
      guest: { requestId: 'req-h', userId: GUEST_A, name: 'Hilde Moen', status: 'approved', hcpIndex: 24.6, tee },
    });
    const filters = admin.__fromCalls.filter((c) => c.method === 'eq' || c.method === 'in').map((c) => c.args);
    expect(filters).toContainEqual(['game_id', GAME]);
    expect(filters).toContainEqual(['brought_by_user_id', HOST]);
    expect(filters).toContainEqual(['status', ['pending', 'approved']]);
  });

  it('a failed read → { ok: false }, never "no guest"', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const admin = buildSupabaseMock([{ data: null, error: { message: 'boom' } }]);
    expect(await readMyBroughtGuest(admin as never, GAME, HOST)).toEqual({ ok: false });
  });
});
