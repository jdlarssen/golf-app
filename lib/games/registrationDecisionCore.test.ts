import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

/**
 * The answer to a registration request without redirects (#2263): the inbox
 * gets a result it can turn into a status line, the signup page wraps it in
 * its old redirects (its own test, signups/actions.test.ts, stays green).
 */

vi.mock('@/lib/games/joinTeeGenders');

const nextRedirectMock = vi.fn();
vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => nextRedirectMock(...args),
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

let adminMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminMock,
}));

const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const SOLO_USER = '22222222-2222-2222-2222-222222222222';
const CAPTAIN_USER = '33333333-3333-3333-3333-333333333333';
const MATE_USER = '44444444-4444-4444-4444-444444444444';
const GAME_ID = '55555555-5555-5555-5555-555555555555';
const SOLO_REQ = '66666666-6666-6666-6666-666666666666';
const CAPTAIN_REQ = '77777777-7777-7777-7777-777777777777';
const MATE_REQ = '88888888-8888-8888-8888-888888888888';
// #2440: an organiser without the admin role, and someone who is neither.
const ORGANISER_ID = '99999999-9999-9999-9999-999999999999';
const STRANGER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

/** Every write the decision makes goes through the admin client (no RLS behind). */
const WRITE_METHODS = new Set(['update', 'upsert', 'insert', 'delete']);

function server(isAdmin: boolean, userId = ADMIN_ID) {
  const mock = buildSupabaseMock([
    { data: { is_admin: isAdmin, name: 'Jørgen' }, error: null },
  ]);
  (mock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { user: { id: userId, email: 'caller@example.test' } },
  });
  return mock as never;
}

const soloRequest = (status = 'pending') => ({
  data: {
    id: SOLO_REQ,
    game_id: GAME_ID,
    user_id: SOLO_USER,
    status,
    is_team_captain: false,
    team_name: null,
    team_request_id: null,
  },
  error: null,
});
const captainRequest = {
  data: {
    id: CAPTAIN_REQ,
    game_id: GAME_ID,
    user_id: CAPTAIN_USER,
    status: 'pending',
    is_team_captain: true,
    team_name: 'Bogeybros',
    team_request_id: null,
  },
  error: null,
};
const game = (status = 'scheduled', createdBy: string | null = ADMIN_ID) => ({
  data: { id: GAME_ID, name: 'Onsdagsgolfen', status, created_by: createdBy },
  error: null,
});

beforeEach(() => {
  vi.clearAllMocks();
});

async function load(isAdmin = true) {
  const { loadRegistrationDecision } = await import('./registrationDecisionCore');
  return loadRegistrationDecision(server(isAdmin), SOLO_REQ);
}

describe('loadRegistrationDecision', () => {
  it('#2440: someone who is neither admin nor organiser gets forbidden — no redirect, no write', async () => {
    adminMock = buildSupabaseMock([soloRequest(), game('scheduled', ORGANISER_ID)]);
    const { loadRegistrationDecision } = await import('./registrationDecisionCore');
    expect(await loadRegistrationDecision(server(false, STRANGER_ID), SOLO_REQ)).toEqual({
      ok: false,
      reason: 'forbidden',
      gameId: null,
      isAdmin: false,
    });
    expect(nextRedirectMock).not.toHaveBeenCalled();
    expect(adminMock.__fromCalls.some((c) => WRITE_METHODS.has(c.method))).toBe(false);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('#2440: a stranger learns nothing about the game — forbidden before game_locked', async () => {
    adminMock = buildSupabaseMock([soloRequest(), game('active', ORGANISER_ID)]);
    const { loadRegistrationDecision } = await import('./registrationDecisionCore');
    expect(await loadRegistrationDecision(server(false, STRANGER_ID), SOLO_REQ)).toMatchObject({
      ok: false,
      reason: 'forbidden',
      gameId: null,
    });
  });

  it('#2440: a game without an organiser (created_by null) is admin-only', async () => {
    adminMock = buildSupabaseMock([soloRequest(), game('scheduled', null)]);
    const { loadRegistrationDecision } = await import('./registrationDecisionCore');
    expect(await loadRegistrationDecision(server(false, STRANGER_ID), SOLO_REQ)).toMatchObject({
      ok: false,
      reason: 'forbidden',
    });
  });

  it('#2440: the organiser without the admin role may answer; the actor is the organiser', async () => {
    adminMock = buildSupabaseMock([soloRequest(), game('scheduled', ORGANISER_ID)]);
    const { loadRegistrationDecision } = await import('./registrationDecisionCore');
    const loaded = await loadRegistrationDecision(server(false, ORGANISER_ID), SOLO_REQ);
    expect(loaded).toMatchObject({ ok: true, ctx: { actorId: ORGANISER_ID } });
  });

  it('an admin may answer on a game someone else made', async () => {
    adminMock = buildSupabaseMock([soloRequest(), game('scheduled', ORGANISER_ID)]);
    expect(await load(true)).toMatchObject({ ok: true, ctx: { actorId: ADMIN_ID } });
  });

  it('a request that is gone → request_not_found', async () => {
    adminMock = buildSupabaseMock([{ data: null, error: null }]);
    expect(await load()).toEqual({
      ok: false,
      reason: 'request_not_found',
      gameId: null,
      isAdmin: true,
    });
  });

  it('a started game → game_locked', async () => {
    adminMock = buildSupabaseMock([soloRequest(), game('active')]);
    expect(await load()).toEqual({ ok: false, reason: 'game_locked', gameId: GAME_ID, isAdmin: true });
  });

  it('a read error throws (#1445)', async () => {
    adminMock = buildSupabaseMock([{ data: null, error: { message: 'AbortError' } }]);
    await expect(load()).rejects.toMatchObject({ message: 'AbortError' });
  });
});

describe('approveRegistrationCore', () => {
  it('approves a solo request: status, game_players, varsel, cache', async () => {
    adminMock = buildSupabaseMock([
      soloRequest(),
      game(),
      { data: [{ id: SOLO_REQ }], error: null },
      { data: [{ user_id: SOLO_USER }], error: null },
    ]);
    const loaded = await load();
    if (!loaded.ok) throw new Error('load failed');
    const { approveRegistrationCore } = await import('./registrationDecisionCore');

    expect(await approveRegistrationCore(loaded.ctx)).toEqual({
      ok: true,
      outcome: 'approved',
      gameId: GAME_ID,
      gameName: 'Onsdagsgolfen',
      teamName: null,
    });
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: SOLO_USER, kind: 'registration_approved' }),
    );
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, { expire: 0 });
    expect(nextRedirectMock).not.toHaveBeenCalled();
  });

  it('a captain takes the whole team in and reports the team name', async () => {
    adminMock = buildSupabaseMock([
      captainRequest,
      game(),
      { data: [{ id: MATE_REQ, user_id: MATE_USER, status: 'pending' }], error: null },
      { data: [], error: null },
      { data: [{ id: CAPTAIN_REQ }, { id: MATE_REQ }], error: null },
      { data: [{ user_id: CAPTAIN_USER }, { user_id: MATE_USER }], error: null },
      { data: [], error: null },
    ]);
    const { loadRegistrationDecision, approveRegistrationCore } = await import('./registrationDecisionCore');
    const loaded = await loadRegistrationDecision(server(true), CAPTAIN_REQ);
    if (!loaded.ok) throw new Error('load failed');

    const result = await approveRegistrationCore(loaded.ctx);
    expect(result).toMatchObject({ ok: true, outcome: 'approved', teamName: 'Bogeybros' });
    const notified = notifyMock.mock.calls.map((c) => (c[0] as { userId: string }).userId);
    expect(notified.sort()).toEqual([CAPTAIN_USER, MATE_USER].sort());
  });

  it('no free team slot → no_team_slot, nothing written', async () => {
    adminMock = buildSupabaseMock([
      captainRequest,
      game(),
      { data: [], error: null },
      { data: Array.from({ length: 50 }, (_, i) => ({ team_number: i + 1 })), error: null },
    ]);
    const { loadRegistrationDecision, approveRegistrationCore } = await import('./registrationDecisionCore');
    const loaded = await loadRegistrationDecision(server(true), CAPTAIN_REQ);
    if (!loaded.ok) throw new Error('load failed');

    expect(await approveRegistrationCore(loaded.ctx)).toEqual({
      ok: false,
      reason: 'no_team_slot',
      gameId: GAME_ID,
    });
    expect(adminMock.__fromCalls.some((c) => c.method === 'update')).toBe(false);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('already decided → not_pending', async () => {
    adminMock = buildSupabaseMock([soloRequest('approved'), game()]);
    const loaded = await load();
    if (!loaded.ok) throw new Error('load failed');
    const { approveRegistrationCore } = await import('./registrationDecisionCore');
    expect(await approveRegistrationCore(loaded.ctx)).toMatchObject({ ok: false, reason: 'not_pending' });
  });

  it('#712: 0-row status update → db_update, no varsel', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    adminMock = buildSupabaseMock([soloRequest(), game(), { data: [], error: null }]);
    const loaded = await load();
    if (!loaded.ok) throw new Error('load failed');
    const { approveRegistrationCore } = await import('./registrationDecisionCore');
    expect(await approveRegistrationCore(loaded.ctx)).toMatchObject({ ok: false, reason: 'db_update' });
    expect(notifyMock).not.toHaveBeenCalled();
  });
});

describe('rejectRegistrationCore', () => {
  it('rejects without a reason (the inbox sends none)', async () => {
    adminMock = buildSupabaseMock([soloRequest(), game(), { data: [{ id: SOLO_REQ }], error: null }]);
    const loaded = await load();
    if (!loaded.ok) throw new Error('load failed');
    const { rejectRegistrationCore } = await import('./registrationDecisionCore');

    expect(await rejectRegistrationCore(loaded.ctx, '')).toMatchObject({ ok: true, outcome: 'rejected' });
    const update = adminMock.__fromCalls.find((c) => c.method === 'update');
    expect(update?.args[0]).toMatchObject({ status: 'rejected', rejection_reason: null });
    expect(notifyMock).toHaveBeenCalledWith({
      userId: SOLO_USER,
      kind: 'registration_rejected',
      payload: { game_id: GAME_ID, game_name: 'Onsdagsgolfen' },
    });
  });

  it('a captain: the team goes down with it, early-accepted teammates too', async () => {
    adminMock = buildSupabaseMock([
      captainRequest,
      game(),
      { data: [{ id: MATE_REQ, user_id: MATE_USER, status: 'approved' }], error: null },
      { data: [{ id: CAPTAIN_REQ }], error: null },
      { data: [{ id: MATE_REQ }], error: null },
    ]);
    const { loadRegistrationDecision, rejectRegistrationCore } = await import('./registrationDecisionCore');
    const loaded = await loadRegistrationDecision(server(true), CAPTAIN_REQ);
    if (!loaded.ok) throw new Error('load failed');

    expect(await rejectRegistrationCore(loaded.ctx, '')).toMatchObject({
      ok: true,
      outcome: 'rejected',
      teamName: 'Bogeybros',
    });
    const updates = adminMock.__fromCalls.filter((c) => c.method === 'update');
    expect(updates).toHaveLength(2);
    expect(notifyMock).toHaveBeenCalledTimes(2);
  });

  it('a reason over the limit → reason_too_long', async () => {
    adminMock = buildSupabaseMock([soloRequest(), game()]);
    const loaded = await load();
    if (!loaded.ok) throw new Error('load failed');
    const { rejectRegistrationCore } = await import('./registrationDecisionCore');
    expect(await rejectRegistrationCore(loaded.ctx, 'x'.repeat(201))).toMatchObject({
      ok: false,
      reason: 'reason_too_long',
    });
  });
});

/**
 * #2440: the organiser without the admin role answers requests to their own
 * game, from the signup page and from the inbox — the same core, the same
 * writes, with the organiser as the one who decided.
 */
describe('the organiser (not admin) answers on their own game', () => {
  it('approves a captain: the whole team goes in, decided by the organiser', async () => {
    adminMock = buildSupabaseMock([
      captainRequest,
      game('scheduled', ORGANISER_ID),
      { data: [{ id: MATE_REQ, user_id: MATE_USER, status: 'pending' }], error: null },
      { data: [], error: null },
      { data: [{ id: CAPTAIN_REQ }, { id: MATE_REQ }], error: null },
      { data: [{ user_id: CAPTAIN_USER }, { user_id: MATE_USER }], error: null },
      { data: [], error: null },
    ]);
    const { loadRegistrationDecision, approveRegistrationCore } = await import('./registrationDecisionCore');
    const loaded = await loadRegistrationDecision(server(false, ORGANISER_ID), CAPTAIN_REQ);
    if (!loaded.ok) throw new Error('load failed');

    expect(await approveRegistrationCore(loaded.ctx)).toMatchObject({
      ok: true,
      outcome: 'approved',
      teamName: 'Bogeybros',
    });
    const update = adminMock.__fromCalls.find((c) => c.method === 'update');
    expect(update?.args[0]).toMatchObject({ status: 'approved', decided_by_user_id: ORGANISER_ID });
    const notified = notifyMock.mock.calls.map((c) => (c[0] as { userId: string }).userId);
    expect(notified.sort()).toEqual([CAPTAIN_USER, MATE_USER].sort());
  });

  it('rejects a solo request, decided by the organiser', async () => {
    adminMock = buildSupabaseMock([
      soloRequest(),
      game('scheduled', ORGANISER_ID),
      { data: [{ id: SOLO_REQ }], error: null },
    ]);
    const { loadRegistrationDecision, rejectRegistrationCore } = await import('./registrationDecisionCore');
    const loaded = await loadRegistrationDecision(server(false, ORGANISER_ID), SOLO_REQ);
    if (!loaded.ok) throw new Error('load failed');

    expect(await rejectRegistrationCore(loaded.ctx, '')).toMatchObject({ ok: true, outcome: 'rejected' });
    const update = adminMock.__fromCalls.find((c) => c.method === 'update');
    expect(update?.args[0]).toMatchObject({ status: 'rejected', decided_by_user_id: ORGANISER_ID });
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: SOLO_USER, kind: 'registration_rejected' }),
    );
  });
});

/**
 * #2263 follow-up (trap 5, atomic-or-compensated): the status update commits
 * before the roster writes. When a later step fails, the rows this attempt
 * decided go back to 'pending' (and rows it inserted are removed), so a retry
 * works instead of finding the request «already decided» with nobody on the
 * roster and no varsel sent.
 */
describe('compensation when a later step fails', () => {
  const ERR = { message: 'AbortError' };

  it('approve: the game_players upsert fails → the request is pending again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    adminMock = buildSupabaseMock([
      soloRequest(),
      game(),
      { data: [{ id: SOLO_REQ }], error: null },
      { data: null, error: ERR },
      { data: [{ id: SOLO_REQ }], error: null },
    ]);
    const loaded = await load();
    if (!loaded.ok) throw new Error('load failed');
    const { approveRegistrationCore } = await import('./registrationDecisionCore');

    expect(await approveRegistrationCore(loaded.ctx)).toMatchObject({ ok: false, reason: 'db_players' });
    const updates = adminMock.__fromCalls.filter((c) => c.method === 'update');
    expect(updates).toHaveLength(2);
    expect(updates[1]!.args[0]).toEqual({ status: 'pending', decided_at: null, decided_by_user_id: null });
    const revertFilters = adminMock.__fromCalls.slice(adminMock.__fromCalls.indexOf(updates[1]!));
    expect(revertFilters).toContainEqual(expect.objectContaining({ method: 'in', args: ['id', [SOLO_REQ]] }));
    expect(revertFilters).toContainEqual(expect.objectContaining({ method: 'eq', args: ['status', 'approved'] }));
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('approve a captain: the team-number update fails → inserted players removed, requests pending again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    adminMock = buildSupabaseMock([
      captainRequest,
      game(),
      { data: [{ id: MATE_REQ, user_id: MATE_USER, status: 'pending' }], error: null },
      { data: [], error: null },
      { data: [{ id: CAPTAIN_REQ }, { id: MATE_REQ }], error: null },
      { data: [{ user_id: CAPTAIN_USER }, { user_id: MATE_USER }], error: null },
      { data: null, error: ERR },
      { data: [{ user_id: CAPTAIN_USER }, { user_id: MATE_USER }], error: null },
      { data: [{ id: CAPTAIN_REQ }, { id: MATE_REQ }], error: null },
    ]);
    const { loadRegistrationDecision, approveRegistrationCore } = await import('./registrationDecisionCore');
    const loaded = await loadRegistrationDecision(server(true), CAPTAIN_REQ);
    if (!loaded.ok) throw new Error('load failed');

    expect(await approveRegistrationCore(loaded.ctx)).toMatchObject({ ok: false, reason: 'db_players' });
    const calls = adminMock.__fromCalls;
    const del = calls.findIndex((c) => c.method === 'delete');
    expect(del).toBeGreaterThan(-1);
    expect(calls.slice(del)).toContainEqual(
      expect.objectContaining({ method: 'in', args: ['user_id', [CAPTAIN_USER, MATE_USER]] }),
    );
    const updates = calls.filter((c) => c.method === 'update');
    expect(updates.at(-1)!.args[0]).toEqual({ status: 'pending', decided_at: null, decided_by_user_id: null });
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('reject a captain: the teammates update fails → the requests are pending again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    adminMock = buildSupabaseMock([
      captainRequest,
      game(),
      { data: [{ id: MATE_REQ, user_id: MATE_USER, status: 'approved' }], error: null },
      { data: [{ id: CAPTAIN_REQ }], error: null },
      { data: null, error: ERR },
      { data: [{ id: CAPTAIN_REQ }], error: null },
    ]);
    const { loadRegistrationDecision, rejectRegistrationCore } = await import('./registrationDecisionCore');
    const loaded = await loadRegistrationDecision(server(true), CAPTAIN_REQ);
    if (!loaded.ok) throw new Error('load failed');

    expect(await rejectRegistrationCore(loaded.ctx, '')).toMatchObject({ ok: false, reason: 'db_update' });
    const updates = adminMock.__fromCalls.filter((c) => c.method === 'update');
    expect(updates).toHaveLength(3);
    expect(updates[2]!.args[0]).toEqual({
      status: 'pending',
      decided_at: null,
      decided_by_user_id: null,
      rejection_reason: null,
    });
    expect(notifyMock).not.toHaveBeenCalled();
  });
});
