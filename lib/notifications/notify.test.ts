import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Admin-client mock — kontrolleres per test via insertMock/userSelectMock.
// insertMock gets the inserted row and answers `.select('id').single()`.
const insertMock =
  vi.fn<(...args: unknown[]) => Promise<{ data: { id: string } | null; error: unknown }>>();
const NOTE_ID = '00000000-0000-0000-0000-0000000000aa';
const userSelectMock = vi.fn<
  (...args: unknown[]) => Promise<{ data: { last_seen_at: string | null; locale: string | null } | null }>
>();
// #2315: the player's push choices. Default: no row (everything on).
type PrefsRow = { muted_groups: string[]; quiet_hours: boolean };
const prefsSelectMock = vi.fn<(...args: unknown[]) => Promise<{ data: PrefsRow | null; error: unknown }>>();
const prefsEqMock = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      if (table === 'notifications') {
        return {
          insert: (...args: unknown[]) => ({
            select: () => ({ single: () => insertMock(...args) }),
          }),
        };
      }
      if (table === 'users') {
        return {
          select: () => ({
            eq: () => ({ single: userSelectMock }),
          }),
        };
      }
      if (table === 'notification_preferences') {
        return {
          select: (columns: string) => ({
            eq: (column: string, value: unknown) => {
              prefsEqMock(columns, column, value);
              return { maybeSingle: prefsSelectMock };
            },
          }),
        };
      }
      throw new Error(`unexpected from(${table}) call`);
    },
  }),
}));

const revalidateTagMock = vi.fn();
vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
}));

const sendPushMock = vi.fn().mockResolvedValue(undefined);
vi.mock('./push/sendPush', () => ({
  sendPushToUser: (...args: unknown[]) => sendPushMock(...args),
}));

import { shouldSendMailFallback, OFF_APP_THRESHOLD_MS } from './notify';

beforeEach(() => {
  insertMock.mockReset();
  userSelectMock.mockReset();
  prefsSelectMock.mockReset();
  prefsEqMock.mockClear();
  revalidateTagMock.mockReset();
  sendPushMock.mockClear();
  // Default: fungerende admin-insert + aktiv bruker (fresh last_seen_at).
  insertMock.mockResolvedValue({ data: { id: NOTE_ID }, error: null });
  userSelectMock.mockResolvedValue({
    data: { last_seen_at: new Date().toISOString(), locale: 'no' },
  });
  prefsSelectMock.mockResolvedValue({ data: null, error: null });
});

describe('shouldSendMailFallback', () => {
  it('returnerer true når last_seen_at er null (aldri vært i appen)', () => {
    expect(shouldSendMailFallback(null)).toBe(true);
  });

  it('returnerer true når last_seen_at er eldre enn terskel', () => {
    const oldDate = new Date(Date.now() - OFF_APP_THRESHOLD_MS - 1000);
    expect(shouldSendMailFallback(oldDate.toISOString())).toBe(true);
  });

  it('returnerer false når last_seen_at er nyere enn terskel', () => {
    const recent = new Date(Date.now() - 60 * 1000); // 1 min siden
    expect(shouldSendMailFallback(recent.toISOString())).toBe(false);
  });

  it('returnerer true når last_seen_at er ugyldig ISO', () => {
    expect(shouldSendMailFallback('not-a-date')).toBe(true);
  });
});

describe('notify (validation-rekkefølge)', () => {
  // Phase 1-review-funn (#172): `parseNotificationPayload` MÅ kjøre før
  // insert. Uten denne testen var rekkefølgen kun implisitt — en bug-fix
  // som flyttet validering bak insert hadde sluppet gjennom.

  it('valid payload → parseNotificationPayload passerer, admin.insert kalles', async () => {
    const { notify } = await import('./notify');

    const result = await notify({
      userId: '00000000-0000-0000-0000-000000000001',
      kind: 'invite',
      payload: {
        game_id: '00000000-0000-0000-0000-000000000002',
        game_name: 'Vinter-cup',
        invited_by_name: 'Jørgen',
      },
    });

    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledWith({
      user_id: '00000000-0000-0000-0000-000000000001',
      kind: 'invite',
      payload: expect.objectContaining({ invited_by_name: 'Jørgen' }),
    });
    expect(revalidateTagMock).toHaveBeenCalledWith(
      'notifications-00000000-0000-0000-0000-000000000001',
      'max',
    );
    expect(result.shouldAlsoSendMail).toBe(false); // aktiv bruker
  });

  it('the row landed but the cache refresh threw: still inserted, never a throw', async () => {
    revalidateTagMock.mockImplementation(() => {
      throw new Error('static generation store missing');
    });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { notify } = await import('./notify');

    const result = await notify({
      userId: '00000000-0000-0000-0000-000000000001',
      kind: 'invite',
      payload: {
        game_id: '00000000-0000-0000-0000-000000000002',
        game_name: 'Vinter-cup',
        invited_by_name: 'Jørgen',
      },
    });

    // Callers release their once-only stamp on a throw or inserted:false; a
    // landed row must answer true, or the reminder would go out twice.
    expect(result.inserted).toBe(true);
    err.mockRestore();
  });

  it('malformed payload (manglende felt) → kaster FØR insert kalles', async () => {
    const { notify } = await import('./notify');

    await expect(
      notify({
        userId: '00000000-0000-0000-0000-000000000001',
        kind: 'scorecard_submitted',
        // Mangler påkrevde game_id, game_name, player_name — Zod kaster.
        payload: { game_id: 'not-a-uuid' } as never,
      }),
    ).rejects.toThrow();

    // Load-bearing: insert MÅ aldri kjøres på malformed input. Hvis denne
    // assertion-en feiler, har valideringen blitt flyttet bak insert.
    expect(insertMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('insert-error → returnerer shouldAlsoSendMail: false (fail-closed)', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    insertMock.mockResolvedValueOnce({ data: null, error: { message: 'permission denied' } });

    const { notify } = await import('./notify');

    const result = await notify({
      userId: '00000000-0000-0000-0000-000000000001',
      kind: 'invite',
      payload: {
        game_id: '00000000-0000-0000-0000-000000000002',
        game_name: 'Vinter-cup',
        invited_by_name: 'Jørgen',
      },
    });

    expect(result.shouldAlsoSendMail).toBe(false);
    expect(revalidateTagMock).not.toHaveBeenCalled();
    expect(consoleErr).toHaveBeenCalledWith(
      '[notifications] insert failed',
      expect.objectContaining({ message: 'permission denied' }),
    );
    consoleErr.mockRestore();
  });

  it('off-app user → sends push AND shouldAlsoSendMail true', async () => {
    userSelectMock.mockResolvedValueOnce({
      data: { last_seen_at: null, locale: 'no' }, // null = off-app
    });
    const { notify } = await import('./notify');

    const result = await notify({
      userId: '00000000-0000-0000-0000-000000000001',
      kind: 'game_finished',
      payload: { game_id: '00000000-0000-0000-0000-000000000002', game_name: 'Cup' },
    });

    expect(sendPushMock).toHaveBeenCalledTimes(1);
    expect(result.shouldAlsoSendMail).toBe(true);
  });

  it('#2201: the push carries the id of the row just inserted', async () => {
    // The tap marks exactly this notification read (`?varsel=<id>`).
    userSelectMock.mockResolvedValueOnce({ data: { last_seen_at: null, locale: 'no' } });
    const { notify } = await import('./notify');

    await notify({
      userId: '00000000-0000-0000-0000-000000000001',
      kind: 'game_started',
      payload: { game_id: '00000000-0000-0000-0000-000000000002', game_name: 'Cup' },
    });

    expect(sendPushMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'game_started', notificationId: NOTE_ID }),
    );
  });

  it('#2201: news about Tørny is never pushed, even off-app', async () => {
    userSelectMock.mockResolvedValueOnce({ data: { last_seen_at: null, locale: 'no' } });
    const { notify } = await import('./notify');

    await notify({
      userId: '00000000-0000-0000-0000-000000000001',
      kind: 'product_update',
      payload: {
        source_id: '00000000-0000-0000-0000-000000000003',
        title: 'Nytt',
        body: 'Tekst',
      },
    });

    // The row is still stored: the inbox and the banner on Hjem show it.
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(sendPushMock).not.toHaveBeenCalled();
  });

  it('on-app user → no push', async () => {
    // default mock = fresh last_seen_at (active)
    const { notify } = await import('./notify');
    await notify({
      userId: '00000000-0000-0000-0000-000000000001',
      kind: 'game_finished',
      payload: { game_id: '00000000-0000-0000-0000-000000000002', game_name: 'Cup' },
    });
    expect(sendPushMock).not.toHaveBeenCalled();
  });
});

describe('notify (#2315: the push choices)', () => {
  const USER = '00000000-0000-0000-0000-000000000001';
  const GAME = '00000000-0000-0000-0000-000000000002';
  // 00:30 and 12:00 in Oslo (winter time, UTC+1).
  const NIGHT = new Date('2026-01-15T23:30:00Z');
  const DAY = new Date('2026-01-15T11:00:00Z');

  const friendRequest = () =>
    notifyFresh({
      userId: USER,
      kind: 'friend_request',
      payload: { actor_id: '00000000-0000-0000-0000-000000000004', actor_name: 'Kari' },
    });
  const gameStarted = () =>
    notifyFresh({ userId: USER, kind: 'game_started', payload: { game_id: GAME, game_name: 'Cup' } });

  async function notifyFresh(opts: Parameters<typeof import('./notify').notify>[0]) {
    const { notify } = await import('./notify');
    return notify(opts);
  }

  beforeEach(() => {
    // Off-app, so the push would go out without the choices.
    userSelectMock.mockResolvedValue({ data: { last_seen_at: null, locale: 'no' } });
    // Only Date is faked: a faked setTimeout hangs the dynamic import (#2292).
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(DAY);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads the choices of the player the notification is for', async () => {
    await gameStarted();

    expect(prefsEqMock).toHaveBeenCalledWith('muted_groups, quiet_hours', 'user_id', USER);
  });

  it('a muted group gets no push, but the mail fallback and the row stand', async () => {
    prefsSelectMock.mockResolvedValue({ data: { muted_groups: ['friends'], quiet_hours: false }, error: null });

    const result = await friendRequest();

    expect(sendPushMock).not.toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ shouldAlsoSendMail: true, inserted: true });
  });

  it('a group that is not muted still pushes', async () => {
    prefsSelectMock.mockResolvedValue({ data: { muted_groups: ['friends'], quiet_hours: false }, error: null });

    await gameStarted();

    expect(sendPushMock).toHaveBeenCalledTimes(1);
  });

  it('quiet hours at night: no push for a group that can be turned off', async () => {
    vi.setSystemTime(NIGHT);
    prefsSelectMock.mockResolvedValue({ data: { muted_groups: [], quiet_hours: true }, error: null });

    const result = await friendRequest();

    expect(sendPushMock).not.toHaveBeenCalled();
    expect(result.shouldAlsoSendMail).toBe(true);
  });

  it('quiet hours at night: «Rundene dine» still pushes', async () => {
    vi.setSystemTime(NIGHT);
    prefsSelectMock.mockResolvedValue({ data: { muted_groups: [], quiet_hours: true }, error: null });

    await gameStarted();

    expect(sendPushMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'game_started' }));
  });

  it('quiet hours in the daytime push as before', async () => {
    prefsSelectMock.mockResolvedValue({ data: { muted_groups: [], quiet_hours: true }, error: null });

    await friendRequest();

    expect(sendPushMock).toHaveBeenCalledTimes(1);
  });

  it('a failed read pushes as before, and is logged', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    prefsSelectMock.mockResolvedValue({ data: null, error: { message: 'relation does not exist' } });

    const result = await friendRequest();

    expect(sendPushMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ shouldAlsoSendMail: true, inserted: true });
    expect(consoleErr).toHaveBeenCalledWith(
      '[notifications] push preferences read failed',
      expect.objectContaining({ message: 'relation does not exist' }),
    );
    consoleErr.mockRestore();
  });

  it('news about Tørny still never pushes, with every group on', async () => {
    prefsSelectMock.mockResolvedValue({ data: { muted_groups: [], quiet_hours: false }, error: null });

    await notifyFresh({
      userId: USER,
      kind: 'product_update',
      payload: { source_id: '00000000-0000-0000-0000-000000000003', title: 'Nytt', body: 'Tekst' },
    });

    expect(sendPushMock).not.toHaveBeenCalled();
  });
});
