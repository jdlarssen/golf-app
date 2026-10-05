import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The inbox's new server actions (#2263): marking a group read, and answering
 * a signup request with «Godta» / «Avslå».
 */

let proxyUserId: string | null = 'user-1';
vi.mock('@/lib/auth/userId', () => ({
  getProxyVerifiedUserId: async () => proxyUserId,
}));

const markIdsMock = vi.fn(async () => true);
const markReadMock = vi.fn(async () => true);
vi.mock('@/lib/notifications/markRead', () => ({
  markNotificationIdsRead: (...args: unknown[]) => markIdsMock(...(args as [])),
  markNotificationsRead: (...args: unknown[]) => markReadMock(...(args as [])),
}));

const archiveMock = vi.fn(async () => true);
vi.mock('@/lib/notifications/archive', () => ({
  archiveNotifications: (...args: unknown[]) => archiveMock(...(args as [])),
}));

vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => ({}),
}));

const loadMock = vi.fn();
const approveMock = vi.fn();
const rejectMock = vi.fn();
vi.mock('@/lib/games/registrationDecisionCore', () => ({
  loadRegistrationDecision: (...args: unknown[]) => loadMock(...args),
  approveRegistrationCore: (...args: unknown[]) => approveMock(...args),
  rejectRegistrationCore: (...args: unknown[]) => rejectMock(...args),
}));

const ID = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const NOTE = ID(9001);
const REQ = ID(9002);
const CTX = { request: {}, game: { id: ID(9003) }, actorId: 'user-1' };

beforeEach(() => {
  vi.clearAllMocks();
  proxyUserId = 'user-1';
});

describe('markGroupAsRead', () => {
  it('marks the given ids for the proxy’s user', async () => {
    const { markGroupAsRead } = await import('./actions');
    expect(await markGroupAsRead([ID(1), ID(2)])).toEqual({ ok: true });
    expect(markIdsMock).toHaveBeenCalledWith({ userId: 'user-1', ids: [ID(1), ID(2)] });
  });

  it('a club-scale group of 150 goes through (the write is sliced in the lib)', async () => {
    const { markGroupAsRead } = await import('./actions');
    const ids = Array.from({ length: 150 }, (_, i) => ID(i + 1));
    expect(await markGroupAsRead(ids)).toEqual({ ok: true });
    expect(markIdsMock).toHaveBeenCalledWith({ userId: 'user-1', ids });
  });

  it('rejects more ids than the inbox can show (600)', async () => {
    const { markGroupAsRead } = await import('./actions');
    const ids = Array.from({ length: 601 }, (_, i) => ID(i + 1));
    expect(await markGroupAsRead(ids)).toEqual({ ok: false });
    expect(markIdsMock).not.toHaveBeenCalled();
  });

  it('rejects ids that are not uuids, and an empty list', async () => {
    const { markGroupAsRead } = await import('./actions');
    expect(await markGroupAsRead([ID(1), 'x; drop table'])).toEqual({ ok: false });
    expect(await markGroupAsRead([])).toEqual({ ok: false });
    expect(markIdsMock).not.toHaveBeenCalled();
  });

  it('not logged in → ok:false', async () => {
    proxyUserId = null;
    const { markGroupAsRead } = await import('./actions');
    expect(await markGroupAsRead([ID(1)])).toEqual({ ok: false });
  });

  it('a write that did not land → ok:false (the client rolls back)', async () => {
    markIdsMock.mockResolvedValueOnce(false);
    const { markGroupAsRead } = await import('./actions');
    expect(await markGroupAsRead([ID(1)])).toEqual({ ok: false });
  });
});

/**
 * #2201: a push tap lands on a page with `?varsel=<id>`; PwaBoot hands the id
 * here. It comes from the address bar, so it is checked, and the write is the
 * proxy user's own rows only: someone else's id simply matches nothing.
 */
describe('markLinkedAsRead', () => {
  it('marks that one id for the proxy’s user, 0 rows allowed', async () => {
    const { markLinkedAsRead } = await import('./actions');
    expect(await markLinkedAsRead(NOTE)).toEqual({ ok: true });
    expect(markReadMock).toHaveBeenCalledWith({
      userId: 'user-1',
      notificationId: NOTE,
      zeroRowsOk: true,
    });
  });

  it.each(['', 'abc', "1' or 1=1", 42 as unknown as string])(
    'rejects %j without a write',
    async (id) => {
      const { markLinkedAsRead } = await import('./actions');
      expect(await markLinkedAsRead(id)).toEqual({ ok: false });
      expect(markReadMock).not.toHaveBeenCalled();
    },
  );

  it('not logged in → ok:false without a write', async () => {
    proxyUserId = null;
    const { markLinkedAsRead } = await import('./actions');
    expect(await markLinkedAsRead(NOTE)).toEqual({ ok: false });
    expect(markReadMock).not.toHaveBeenCalled();
  });
});

describe('decideRegistration', () => {
  it('approve → archives the varsel and reports game + team', async () => {
    loadMock.mockResolvedValueOnce({ ok: true, ctx: CTX });
    approveMock.mockResolvedValueOnce({
      ok: true,
      outcome: 'approved',
      gameId: CTX.game.id,
      gameName: 'Onsdagsgolfen',
      teamName: 'Bogeybros',
    });
    const { decideRegistration } = await import('./actions');
    expect(await decideRegistration(NOTE, REQ, 'approve')).toEqual({
      ok: true,
      outcome: 'approved',
      gameName: 'Onsdagsgolfen',
      teamName: 'Bogeybros',
    });
    expect(archiveMock).toHaveBeenCalledWith({ userId: 'user-1', notificationId: NOTE });
  });

  it('reject sends no reason', async () => {
    loadMock.mockResolvedValueOnce({ ok: true, ctx: CTX });
    rejectMock.mockResolvedValueOnce({
      ok: true,
      outcome: 'rejected',
      gameId: CTX.game.id,
      gameName: 'Onsdagsgolfen',
      teamName: null,
    });
    const { decideRegistration } = await import('./actions');
    expect(await decideRegistration(NOTE, REQ, 'reject')).toMatchObject({ ok: true, outcome: 'rejected' });
    expect(rejectMock).toHaveBeenCalledWith(CTX, '');
  });

  it.each(['not_pending', 'request_not_found', 'game_not_found', 'game_locked'] as const)(
    '%s → marks the varsel read, reports the reason',
    async (reason) => {
      if (reason === 'not_pending') {
        loadMock.mockResolvedValueOnce({ ok: true, ctx: CTX });
        approveMock.mockResolvedValueOnce({ ok: false, reason, gameId: CTX.game.id });
      } else {
        loadMock.mockResolvedValueOnce({ ok: false, reason, gameId: null, isAdmin: false });
      }
      const { decideRegistration } = await import('./actions');
      expect(await decideRegistration(NOTE, REQ, 'approve')).toEqual({ ok: false, reason });
      expect(markReadMock).toHaveBeenCalledWith({ userId: 'user-1', notificationId: NOTE });
      expect(archiveMock).not.toHaveBeenCalled();
    },
  );

  it.each(['forbidden'] as const)('%s (load) → reason, varsel untouched', async (reason) => {
    loadMock.mockResolvedValueOnce({ ok: false, reason, gameId: null, isAdmin: false });
    const { decideRegistration } = await import('./actions');
    expect(await decideRegistration(NOTE, REQ, 'approve')).toEqual({ ok: false, reason });
    expect(markReadMock).not.toHaveBeenCalled();
    expect(archiveMock).not.toHaveBeenCalled();
  });

  it.each(['no_team_slot', 'db_update', 'db_players', 'db_cascade', 'db_team_slot'] as const)(
    '%s (core) → reason, varsel untouched',
    async (reason) => {
      loadMock.mockResolvedValueOnce({ ok: true, ctx: CTX });
      approveMock.mockResolvedValueOnce({ ok: false, reason, gameId: CTX.game.id });
      const { decideRegistration } = await import('./actions');
      expect(await decideRegistration(NOTE, REQ, 'approve')).toEqual({ ok: false, reason });
      expect(markReadMock).not.toHaveBeenCalled();
    },
  );

  it('the core throws → ok:false, reason error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    loadMock.mockRejectedValueOnce(new Error('AbortError'));
    const { decideRegistration } = await import('./actions');
    expect(await decideRegistration(NOTE, REQ, 'approve')).toEqual({ ok: false, reason: 'error' });
  });

  it('bad input or no user never reaches the core', async () => {
    const { decideRegistration } = await import('./actions');
    expect(await decideRegistration('nope', REQ, 'approve')).toEqual({ ok: false, reason: 'error' });
    expect(await decideRegistration(NOTE, REQ, 'maybe' as 'approve')).toEqual({ ok: false, reason: 'error' });
    proxyUserId = null;
    expect(await decideRegistration(NOTE, REQ, 'approve')).toEqual({ ok: false, reason: 'error' });
    expect(loadMock).not.toHaveBeenCalled();
  });
});
