import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The APNs half of the sendPushToUser fan-out (#1282). Lives in its own file so
 * `sendPush.test.ts` — the #24 web-push regression guard — stays byte-identical.
 *
 * Boundary mocks only: `sendApnsNotification` (the http2 call) and the two
 * `isConfigured` gates. `decidePruneAction` and `buildApnsPayload` run for real,
 * so what is under test here is the ROUTING — which host is tried, when a retry
 * happens, and what lands in the database afterwards.
 */

let webConfigured = false;
let apnsConfigured = true;

const sendNotificationMock = vi.fn();
vi.mock('./vapid', () => ({
  ensureVapid: () => (webConfigured ? { sendNotification: sendNotificationMock } : null),
  isPushConfigured: () => webConfigured,
}));

// vi.hoisted: the mock factory below is hoisted above this file's top-level
// consts, and it dereferences the mock immediately (not lazily like the vapid
// one), so the fn has to exist before the hoisted block runs.
const { sendApnsMock } = vi.hoisted(() => ({ sendApnsMock: vi.fn() }));
vi.mock('./apns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./apns')>();
  return {
    ...actual,
    isApnsConfigured: () => apnsConfigured,
    sendApnsNotification: sendApnsMock,
  };
});

type ApnsRow = { id: string; token: string; environment: string | null };

const apnsRows: ApnsRow[] = [];
const tablesQueried: string[] = [];
const apnsUpdates: Array<{ patch: Record<string, unknown>; token: unknown }> = [];
const apnsDeletes: unknown[] = [];

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      if (table === 'push_subscriptions') {
        return {
          select: () => ({
            eq: () => {
              tablesQueried.push(table);
              return Promise.resolve({ data: [], error: null });
            },
          }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
          delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
      if (table === 'apns_tokens') {
        return {
          select: () => ({
            eq: () => {
              tablesQueried.push(table);
              return Promise.resolve({ data: apnsRows, error: null });
            },
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: (_col: string, val: unknown) => {
              apnsUpdates.push({ patch, token: val });
              return Promise.resolve({ error: null });
            },
          }),
          delete: () => ({
            eq: (_col: string, val: unknown) => {
              apnsDeletes.push(val);
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      throw new Error(`unexpected ${table}`);
    },
  }),
}));

vi.mock('@/lib/notifications/inboxTranslator', () => ({
  getInboxTranslator: async () => (key: string) => key,
}));
vi.mock('@/lib/notifications/cardContent', () => ({
  buildNotificationText: () => ({ title: 'T', detail: 'D' }),
}));
vi.mock('@/lib/notifications/deeplink', () => ({
  notificationDestination: () => '/games/abc',
}));

import { sendPushToUser } from './sendPush';

const TOKEN = 'a'.repeat(64);

/** APNs answers 200 with an empty body on success. */
const OK = { status: 200, reason: null };
const BAD_TOKEN = { status: 400, reason: 'BadDeviceToken' };

function send() {
  return sendPushToUser({
    userId: 'u',
    kind: 'game_finished',
    payload: {} as never,
    locale: 'no',
  });
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  webConfigured = false;
  apnsConfigured = true;
  sendApnsMock.mockReset();
  sendNotificationMock.mockReset();
  apnsRows.length = 0;
  tablesQueried.length = 0;
  apnsUpdates.length = 0;
  apnsDeletes.length = 0;
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe('sendPushToUser — APNs channel', () => {
  it('sends to the stored environment when the token already has one', async () => {
    apnsRows.push({ id: '1', token: TOKEN, environment: 'sandbox' });
    sendApnsMock.mockResolvedValueOnce(OK);

    await send();

    expect(sendApnsMock).toHaveBeenCalledTimes(1);
    expect(sendApnsMock.mock.calls[0][2]).toBe('sandbox');
    expect(apnsUpdates).toHaveLength(1);
    expect(apnsUpdates[0].token).toBe(TOKEN);
    expect(apnsUpdates[0].patch.last_used_at).toBeTypeOf('string');
    expect(apnsDeletes).toHaveLength(0);
  });

  it('carries the notification text and deeplink into the aps payload', async () => {
    apnsRows.push({ id: '1', token: TOKEN, environment: 'production' });
    sendApnsMock.mockResolvedValueOnce(OK);

    await send();

    expect(sendApnsMock.mock.calls[0][1]).toEqual({
      aps: { alert: { title: 'T', body: 'D' }, sound: 'default' },
      url: '/games/abc',
      kind: 'game_finished',
    });
  });

  it('unknown environment → tries production first and persists it on success', async () => {
    apnsRows.push({ id: '1', token: TOKEN, environment: null });
    sendApnsMock.mockResolvedValueOnce(OK);

    await send();

    expect(sendApnsMock).toHaveBeenCalledTimes(1);
    expect(sendApnsMock.mock.calls[0][2]).toBe('production');
    expect(apnsUpdates[0].patch.environment).toBe('production');
  });

  it('unknown environment rejected by production → retries sandbox and persists sandbox', async () => {
    apnsRows.push({ id: '1', token: TOKEN, environment: null });
    sendApnsMock.mockResolvedValueOnce(BAD_TOKEN).mockResolvedValueOnce(OK);

    await send();

    expect(sendApnsMock.mock.calls.map((c) => c[2])).toEqual(['production', 'sandbox']);
    expect(apnsUpdates[0].patch.environment).toBe('sandbox');
    expect(apnsDeletes).toHaveLength(0);
  });

  it('rejected by BOTH environments → prunes the row', async () => {
    apnsRows.push({ id: '1', token: TOKEN, environment: null });
    sendApnsMock.mockResolvedValue(BAD_TOKEN);

    await send();

    expect(sendApnsMock).toHaveBeenCalledTimes(2);
    expect(apnsDeletes).toEqual([TOKEN]);
    expect(apnsUpdates).toHaveLength(0);
  });

  it('410 Unregistered → prunes without retrying the other environment', async () => {
    apnsRows.push({ id: '1', token: TOKEN, environment: null });
    sendApnsMock.mockResolvedValueOnce({ status: 410, reason: 'Unregistered' });

    await send();

    expect(sendApnsMock).toHaveBeenCalledTimes(1);
    expect(apnsDeletes).toEqual([TOKEN]);
  });

  it('a transient 500 → keeps the row and logs', async () => {
    apnsRows.push({ id: '1', token: TOKEN, environment: 'production' });
    sendApnsMock.mockResolvedValueOnce({ status: 500, reason: 'InternalServerError' });

    await send();

    expect(apnsDeletes).toHaveLength(0);
    expect(apnsUpdates).toHaveLength(0);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('a thrown network error keeps the row and never escapes to the caller', async () => {
    apnsRows.push({ id: '1', token: TOKEN, environment: 'production' });
    sendApnsMock.mockRejectedValueOnce(new Error('ECONNRESET'));

    await expect(send()).resolves.toBeUndefined();
    expect(apnsDeletes).toHaveLength(0);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('APNs unconfigured → apns_tokens is never read (web-push still is)', async () => {
    webConfigured = true;
    apnsConfigured = false;
    apnsRows.push({ id: '1', token: TOKEN, environment: null });

    await send();

    expect(tablesQueried).toEqual(['push_subscriptions']);
    expect(sendApnsMock).not.toHaveBeenCalled();
  });

  it('both channels unconfigured → no queries at all', async () => {
    webConfigured = false;
    apnsConfigured = false;

    await send();

    expect(tablesQueried).toEqual([]);
  });

  it('APNs configured but web-push is not → APNs still goes out', async () => {
    apnsRows.push({ id: '1', token: TOKEN, environment: 'production' });
    sendApnsMock.mockResolvedValueOnce(OK);

    await send();

    expect(tablesQueried).toEqual(['apns_tokens']);
    expect(sendApnsMock).toHaveBeenCalledTimes(1);
  });
});
