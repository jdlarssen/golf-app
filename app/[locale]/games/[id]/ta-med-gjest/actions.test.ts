import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock, makeLocaleRedirectMock, RedirectError } from '@/tests/serverActionMocks';

/**
 * Type A (#2607, fase 2): «Ta med en gjest» and «Fjern gjesten».
 *
 *  - every condition of the row gives its own code, and nothing is written;
 *  - open with a cap: shadow user + approved request (brought_by the host) +
 *    the seat claim for the guest with p_accepted_at;
 *  - open without a cap: a plain roster insert with accepted_at;
 *  - manual approval: a pending request, no seat, the varsel with request_id;
 *  - the guard's limit and a full round: what the call made is removed again;
 *  - «Fjern gjesten» refuses a request that is not the caller's.
 *
 * The rule itself (the host on the roster, one guest, the guest leaves with
 * the host) is the database's: supabase/tests/guests_follow_their_host_test.sql.
 */

const redirectMock = makeLocaleRedirectMock();
vi.mock('@/i18n/navigation', () => ({
  redirect: (arg: { href: string; locale?: string } | string) => redirectMock(arg),
}));

const revalidateTagMock = vi.fn();
vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
}));

const notifyMock = vi.fn<(...args: unknown[]) => Promise<{ shouldAlsoSendMail: boolean }>>(
  async () => ({ shouldAlsoSendMail: false }),
);
vi.mock('@/lib/notifications/notify', () => ({
  notify: (...args: unknown[]) => notifyMock(...args),
}));

const consumeRateLimitMock = vi.fn<(...args: unknown[]) => Promise<{ ok: boolean }>>(async () => ({
  ok: true,
}));
vi.mock('@/lib/auth/registrationRateLimit', () => ({
  consumeRegistrationRateLimit: (...args: unknown[]) => consumeRateLimitMock(...args),
}));
vi.mock('@/lib/admin/rateLimit', () => ({
  getClientIp: async () => '127.0.0.1',
}));

const sendMailMock = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {});
vi.mock('@/lib/mail/registrationRequest', () => ({
  sendRegistrationRequestMail: (...args: unknown[]) => sendMailMock(...args),
}));

let serverMock: ReturnType<typeof buildSupabaseMock>;
let adminMock: ReturnType<typeof buildSupabaseMock> & {
  auth: { admin: { createUser: ReturnType<typeof vi.fn>; deleteUser: ReturnType<typeof vi.fn> } };
};
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => serverMock,
}));
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminMock,
}));

const HOST = '11111111-1111-1111-1111-111111111111';
const ORGANISER = '22222222-2222-2222-2222-222222222222';
const GAME = '33333333-3333-3333-3333-333333333333';
const GUEST = '44444444-4444-4444-4444-444444444444';
const REQ = '55555555-5555-5555-5555-555555555555';

type Game = Record<string, unknown>;
const baseGame = (over: Game = {}): Game => ({
  id: GAME,
  name: 'Lørdagsrunden',
  status: 'scheduled',
  created_by: ORGANISER,
  game_mode: 'stableford',
  mode_config: {},
  registration_mode: 'open',
  registration_type: 'solo',
  signups_closed_at: null,
  tournament_id: null,
  league_round_id: null,
  tee_boxes: null,
  ...over,
});

function setup(opts: {
  game?: Game;
  seat?: { withdrawn_at: string | null } | null;
  hostIsGuest?: boolean;
  requestInsert?: { data: unknown; error: unknown };
  claim?: unknown;
}) {
  serverMock = buildSupabaseMock([]);
  (serverMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { user: { id: HOST } },
  });
  const mock = buildSupabaseMock([], { claim_open_registration_seat: opts.claim ?? { outcome: 'ok' } }, {
    byTable: {
      games: [{ data: opts.game ?? baseGame(), error: null }],
      game_players: [
        { data: opts.seat === undefined ? { withdrawn_at: null } : opts.seat, error: null },
        { data: null, error: null },
      ],
      users: [
        {
          data: { is_guest: opts.hostIsGuest ?? false, name: 'Ola Vert', nickname: null, email: 'ola@example.test' },
          error: null,
        },
        // createGuestUser's profile update
        { data: [{ id: GUEST }], error: null },
      ],
      game_registration_requests: [
        opts.requestInsert ?? { data: { id: REQ }, error: null },
        // the compensating delete
        { data: [{ id: REQ }], error: null },
      ],
    },
  });
  adminMock = Object.assign(mock, {
    auth: {
      ...mock.auth,
      admin: {
        createUser: vi.fn(async () => ({ data: { user: { id: GUEST } }, error: null })),
        deleteUser: vi.fn(async () => ({ error: null })),
      },
    },
  });
}

function guestForm(over: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set('guest_name', 'Hilde Moen');
  fd.set('guest_hcp', '24,6');
  fd.set('guest_tee', 'D');
  for (const [k, v] of Object.entries(over)) fd.set(k, v);
  return fd;
}

async function bring(fd = guestForm()) {
  const { bringGuest } = await import('./actions');
  try {
    return await bringGuest(GAME, fd);
  } catch (err) {
    if (err instanceof RedirectError) return { redirect: err.url };
    throw err;
  }
}

const writes = () =>
  adminMock.__fromCalls.filter((c) => ['insert', 'update', 'delete', 'upsert'].includes(c.method));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('bringGuest — the gate', () => {
  it('not logged in → not_authed', async () => {
    setup({});
    (serverMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { user: null } });
    expect(await bring()).toEqual({ ok: false, error: 'not_authed' });
  });

  it.each([
    ['not on the roster', { seat: null }, 'not_on_roster'],
    ['withdrawn', { seat: { withdrawn_at: '2026-10-30T10:00:00Z' } }, 'withdrawn'],
    ['a guest', { hostIsGuest: true }, 'is_guest'],
    ['the organiser', { game: baseGame({ created_by: HOST }) }, 'is_organiser'],
    [
      'a team format',
      { game: baseGame({ game_mode: 'texas_scramble', registration_type: 'team', mode_config: { team_size: 4 } }) },
      'team_format',
    ],
    ['matchplay', { game: baseGame({ game_mode: 'singles_matchplay' }) }, 'matchplay'],
    ['a cup match', { game: baseGame({ tournament_id: '66666666-6666-6666-6666-666666666666' }) }, 'cup'],
    ['a league round', { game: baseGame({ league_round_id: '77777777-7777-7777-7777-777777777777' }) }, 'league'],
    ['sign-up closed', { game: baseGame({ signups_closed_at: '2026-10-30T10:00:00Z' }) }, 'signup_closed'],
    ['invite only', { game: baseGame({ registration_mode: 'invite_only' }) }, 'wrong_mode'],
    ['a started round', { game: baseGame({ status: 'active' }) }, 'game_locked'],
  ] as const)('%s → %s, nothing written', async (_label, opts, code) => {
    setup(opts as Parameters<typeof setup>[0]);
    expect(await bring()).toEqual({ ok: false, error: code });
    expect(writes()).toEqual([]);
    expect(adminMock.auth.admin.createUser).not.toHaveBeenCalled();
    expect(adminMock.__rpcCalls).toEqual([]);
  });

  it('a draft answers like a game that does not exist (#2445)', async () => {
    setup({ game: baseGame({ status: 'draft' }) });
    expect(await bring()).toEqual({ ok: false, error: 'game_not_found' });
  });

  it('rate limited → rate_limited, no guest made', async () => {
    setup({});
    consumeRateLimitMock.mockResolvedValueOnce({ ok: false });
    expect(await bring()).toEqual({ ok: false, error: 'rate_limited' });
    expect(adminMock.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it('an invalid guest → its own code, no guest made', async () => {
    setup({});
    expect(await bring(guestForm({ guest_name: ' ' }))).toEqual({ ok: false, error: 'guest_invalid_name' });
    expect(adminMock.auth.admin.createUser).not.toHaveBeenCalled();
  });
});

describe('bringGuest — the writes', () => {
  it('open with a cap: shadow user, approved request by the host, the seat claim for the guest', async () => {
    setup({ game: baseGame({ game_mode: 'skins' }) });
    expect(await bring()).toEqual({ redirect: `/games/${GAME}/ta-med-gjest?status=added` });

    expect(adminMock.auth.admin.createUser).toHaveBeenCalledTimes(1);
    const insert = adminMock.__fromCalls.find(
      (c) => c.table === 'game_registration_requests' && c.method === 'insert',
    );
    expect(insert!.args[0]).toEqual({
      game_id: GAME,
      user_id: GUEST,
      status: 'approved',
      is_team_captain: false,
      brought_by_user_id: HOST,
      decided_by_user_id: HOST,
      decided_at: expect.any(String),
    });
    expect(adminMock.__rpcCalls).toEqual([
      {
        name: 'claim_open_registration_seat',
        params: expect.objectContaining({
          p_game_id: GAME,
          p_user_id: GUEST,
          p_accepted_at: expect.any(String),
          p_cap: expect.any(Number),
          p_tee_gender: 'ladies',
        }),
      },
    ]);
    expect(adminMock.__fromCalls.some((c) => c.table === 'game_players' && c.method === 'insert')).toBe(false);
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME}`, { expire: 0 });
    expect(notifyMock).toHaveBeenCalledWith({
      userId: ORGANISER,
      kind: 'registration_request',
      payload: {
        game_id: GAME,
        game_name: 'Lørdagsrunden',
        requester_name: 'Hilde Moen',
        message: 'Gjest, tatt med av Ola Vert',
      },
    });
  });

  it('open without a cap: a plain roster insert with accepted_at', async () => {
    setup({});
    expect(await bring()).toEqual({ redirect: `/games/${GAME}/ta-med-gjest?status=added` });
    expect(adminMock.__rpcCalls).toEqual([]);
    const seat = adminMock.__fromCalls.find((c) => c.table === 'game_players' && c.method === 'insert');
    expect(seat!.args[0]).toEqual(
      expect.objectContaining({ game_id: GAME, user_id: GUEST, tee_gender: 'ladies', accepted_at: expect.any(String) }),
    );
  });

  it('manual approval: a pending request, no seat, the varsel with request_id', async () => {
    setup({ game: baseGame({ registration_mode: 'manual_approval' }) });
    expect(await bring()).toEqual({ redirect: `/games/${GAME}/ta-med-gjest?status=added` });
    const insert = adminMock.__fromCalls.find(
      (c) => c.table === 'game_registration_requests' && c.method === 'insert',
    );
    expect(insert!.args[0]).toEqual({
      game_id: GAME,
      user_id: GUEST,
      status: 'pending',
      is_team_captain: false,
      brought_by_user_id: HOST,
    });
    expect(adminMock.__rpcCalls).toEqual([]);
    expect(adminMock.__fromCalls.some((c) => c.table === 'game_players' && c.method === 'insert')).toBe(false);
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ request_id: REQ }) }),
    );
  });

  it('the guard says one guest (brought_guest_limit) → that code, the shadow user is deleted', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    setup({ requestInsert: { data: null, error: { code: '23514', message: 'brought_guest_limit' } } });
    expect(await bring()).toEqual({ ok: false, error: 'brought_guest_limit' });
    expect(adminMock.auth.admin.deleteUser).toHaveBeenCalledWith(GUEST);
    // No request was written, so none is deleted.
    expect(adminMock.__fromCalls.some((c) => c.method === 'delete')).toBe(false);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('the round is full at the seat claim → game_full; the request (row count checked) and the shadow user go', async () => {
    setup({ game: baseGame({ game_mode: 'skins' }), claim: { outcome: 'game_full' } });
    expect(await bring()).toEqual({ ok: false, error: 'game_full' });
    const del = adminMock.__fromCalls.find(
      (c) => c.table === 'game_registration_requests' && c.method === 'delete',
    );
    expect(del).toBeDefined();
    const after = adminMock.__fromCalls.slice(adminMock.__fromCalls.indexOf(del!));
    expect(after).toContainEqual(expect.objectContaining({ method: 'eq', args: ['id', REQ] }));
    expect(after).toContainEqual(expect.objectContaining({ method: 'select', args: ['id'] }));
    expect(adminMock.auth.admin.deleteUser).toHaveBeenCalledWith(GUEST);
    expect(notifyMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });
});

describe('removeBroughtGuest', () => {
  function setupRemove(row: Record<string, unknown> | null) {
    serverMock = buildSupabaseMock([]);
    (serverMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { user: { id: HOST } } });
    const mock = buildSupabaseMock([], {}, {
      byTable: {
        game_registration_requests: [
          { data: row, error: null },
          { data: [{ id: REQ }], error: null },
        ],
        game_players: [{ data: [{ user_id: GUEST }], error: null }],
      },
    });
    adminMock = Object.assign(mock, {
      auth: { ...mock.auth, admin: { createUser: vi.fn(), deleteUser: vi.fn() } },
    });
  }

  async function remove() {
    const { removeBroughtGuest } = await import('./actions');
    const fd = new FormData();
    fd.set('requestId', REQ);
    try {
      await removeBroughtGuest(GAME, fd);
    } catch (err) {
      if (err instanceof RedirectError) return err.url;
      throw err;
    }
    return null;
  }

  const row = (over: Record<string, unknown> = {}) => ({
    id: REQ,
    game_id: GAME,
    user_id: GUEST,
    status: 'approved',
    decided_at: '2026-10-30T10:00:00Z',
    decided_by_user_id: HOST,
    brought_by_user_id: HOST,
    games: { status: 'scheduled' },
    ...over,
  });

  it.each([
    ['another player\'s guest', row({ brought_by_user_id: ORGANISER })],
    ['a request in another game', row({ game_id: '99999999-9999-9999-9999-999999999999' })],
    ['a guest already withdrawn', row({ status: 'withdrawn' })],
    ['no such request', null],
  ])('%s → not_your_guest, nothing written', async (_label, r) => {
    setupRemove(r);
    expect(await remove()).toBe(`/games/${GAME}/ta-med-gjest?error=not_your_guest`);
    expect(writes()).toEqual([]);
  });

  it('the host\'s own guest: the request is withdrawn by the host, then the seat goes', async () => {
    setupRemove(row());
    expect(await remove()).toBe(`/games/${GAME}/ta-med-gjest`);
    const [update, del] = writes();
    expect(update!.table).toBe('game_registration_requests');
    expect(update!.args[0]).toEqual({
      status: 'withdrawn',
      decided_at: expect.any(String),
      decided_by_user_id: HOST,
    });
    const afterUpdate = adminMock.__fromCalls.slice(adminMock.__fromCalls.indexOf(update!));
    expect(afterUpdate).toContainEqual(expect.objectContaining({ method: 'eq', args: ['brought_by_user_id', HOST] }));
    expect(del!.table).toBe('game_players');
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME}`, { expire: 0 });
  });
});
