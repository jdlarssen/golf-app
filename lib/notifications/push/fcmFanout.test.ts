import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The FCM half of the sendPushToUser fan-out (#2758). In its own file so
 * `sendPush.test.ts` and `apnsFanout.test.ts` stay byte-identical: they prove the
 * other two channels go on as before when FCM is unconfigured.
 *
 * Boundary mocks only: `sendFcmNotification` (the HTTP call) and the
 * `isConfigured` gates. `decideFcmPruneAction` and `buildFcmMessage` run for real,
 * so what is under test is the ROUTING and what lands in the database afterwards.
 */

let webConfigured = false;
let apnsConfigured = false;
let fcmConfigured = true;

const sendNotificationMock = vi.fn();
vi.mock('./vapid', () => ({
  ensureVapid: () => (webConfigured ? { sendNotification: sendNotificationMock } : null),
  isPushConfigured: () => webConfigured,
}));

const { sendApnsMock, sendFcmMock } = vi.hoisted(() => ({
  sendApnsMock: vi.fn(),
  sendFcmMock: vi.fn(),
}));
vi.mock('./apns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./apns')>();
  return {
    ...actual,
    isApnsConfigured: () => apnsConfigured,
    sendApnsNotification: sendApnsMock,
  };
});
vi.mock('./fcm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./fcm')>();
  return {
    ...actual,
    isFcmConfigured: () => fcmConfigured,
    sendFcmNotification: sendFcmMock,
  };
});

type Rows = Record<string, Array<Record<string, unknown>>>;

const rows: Rows = { push_subscriptions: [], apns_tokens: [], fcm_tokens: [] };
const tablesQueried: string[] = [];
const fcmUpdates: Array<{ patch: Record<string, unknown>; token: unknown }> = [];
const fcmDeletes: unknown[] = [];
let fcmReadError: { message: string } | null = null;

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      if (!(table in rows)) throw new Error(`unexpected ${table}`);
      return {
        select: () => ({
          eq: () => {
            tablesQueried.push(table);
            return table === 'fcm_tokens' && fcmReadError
              ? Promise.resolve({ data: null, error: fcmReadError })
              : Promise.resolve({ data: rows[table], error: null });
          },
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: (_col: string, val: unknown) => {
            if (table === 'fcm_tokens') fcmUpdates.push({ patch, token: val });
            return Promise.resolve({ error: null });
          },
        }),
        delete: () => ({
          eq: (_col: string, val: unknown) => {
            if (table === 'fcm_tokens') fcmDeletes.push(val);
            return Promise.resolve({ error: null });
          },
        }),
      };
    },
  }),
}));

vi.mock('@/lib/notifications/inboxTranslator', () => ({
  getInboxTranslator: async () => (key: string) => key,
}));
const buildTextMock = vi.hoisted(() => vi.fn(() => ({ title: 'T', detail: 'D' })));
vi.mock('@/lib/notifications/cardContent', () => ({
  buildNotificationText: buildTextMock,
}));
vi.mock('@/lib/notifications/deeplink', () => ({
  notificationDestination: () => '/games/abc',
}));

import { sendPushToUser } from './sendPush';

const OK = { status: 200, errorCode: null };
const UNREGISTERED = { status: 404, errorCode: 'UNREGISTERED' };

const fcmRow = (id: string) => ({ id, token: `token-${id}` });

function send(notificationId?: string) {
  return sendPushToUser({
    userId: 'u',
    kind: 'game_finished',
    payload: {} as never,
    locale: 'no',
    notificationId,
  });
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  webConfigured = false;
  apnsConfigured = false;
  fcmConfigured = true;
  fcmReadError = null;
  sendNotificationMock.mockReset();
  sendApnsMock.mockReset();
  sendFcmMock.mockReset();
  buildTextMock.mockClear();
  for (const table of Object.keys(rows)) rows[table].length = 0;
  tablesQueried.length = 0;
  fcmUpdates.length = 0;
  fcmDeletes.length = 0;
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe('sendPushToUser — FCM channel', () => {
  it('sends to the device, carries the deeplink with the read marker, and touches the row', async () => {
    rows.fcm_tokens.push(fcmRow('1'));
    sendFcmMock.mockResolvedValueOnce(OK);
    const id = '5f0c1b2a-3d4e-4f60-8a71-92b3c4d5e6f7';

    await send(id);

    expect(sendFcmMock).toHaveBeenCalledTimes(1);
    expect(sendFcmMock.mock.calls[0][0]).toBe('token-1');
    expect(sendFcmMock.mock.calls[0][1]).toMatchObject({
      notification: { title: 'T', body: 'D' },
      data: { url: `/games/abc?varsel=${id}`, kind: 'game_finished' },
    });
    expect(fcmUpdates).toHaveLength(1);
    expect(fcmUpdates[0].token).toBe('token-1');
    expect(fcmUpdates[0].patch.last_used_at).toBeTypeOf('string');
    expect(fcmDeletes).toHaveLength(0);
  });

  // #2749: the app shows the entry fee, so every channel gets the one text.
  it('#2749: Android gets the same text as web push', async () => {
    webConfigured = true;
    rows.push_subscriptions.push({ id: '1', endpoint: 'https://push/x', p256dh: 'k', auth: 'a' });
    sendNotificationMock.mockResolvedValueOnce({ statusCode: 201 });
    rows.fcm_tokens.push(fcmRow('1'));
    sendFcmMock.mockResolvedValueOnce(OK);

    await send();

    expect(JSON.parse(sendNotificationMock.mock.calls[0][1] as string).body).toBe('D');
    expect(sendFcmMock.mock.calls[0][1]).toMatchObject({ notification: { body: 'D' } });
    expect(buildTextMock).toHaveBeenCalledTimes(1);
  });

  it('UNREGISTERED deletes that row only', async () => {
    rows.fcm_tokens.push(fcmRow('dead'), fcmRow('alive'));
    sendFcmMock.mockImplementation(async (token: string) =>
      token === 'token-dead' ? UNREGISTERED : OK,
    );

    await send();

    expect(fcmDeletes).toEqual(['token-dead']);
    expect(fcmUpdates.map((update) => update.token)).toEqual(['token-alive']);
  });

  it.each([
    { name: '500', answer: { status: 500, errorCode: 'INTERNAL' } },
    { name: '403', answer: { status: 403, errorCode: 'SENDER_ID_MISMATCH' } },
    { name: 'a 404 without the code', answer: { status: 404, errorCode: null } },
  ])('$name keeps the row and logs, without the token', async ({ answer }) => {
    rows.fcm_tokens.push(fcmRow('1'));
    sendFcmMock.mockResolvedValueOnce(answer);

    await send();

    expect(fcmDeletes).toHaveLength(0);
    expect(fcmUpdates).toHaveLength(0);
    expect(errorSpy).toHaveBeenCalled();
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('token-1');
  });

  it('a network error keeps the row, logs without the token, and never escapes', async () => {
    rows.fcm_tokens.push(fcmRow('1'));
    sendFcmMock.mockRejectedValueOnce(new Error('ECONNRESET'));

    await expect(send()).resolves.toBeUndefined();

    expect(fcmDeletes).toHaveLength(0);
    expect(errorSpy).toHaveBeenCalled();
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('token-1');
  });

  it('an FCM failure stops neither APNs nor web push', async () => {
    webConfigured = true;
    apnsConfigured = true;
    rows.push_subscriptions.push({ id: '1', endpoint: 'https://push/x', p256dh: 'k', auth: 'a' });
    rows.apns_tokens.push({ id: '1', token: 'a'.repeat(64), environment: 'production' });
    rows.fcm_tokens.push(fcmRow('1'));
    sendNotificationMock.mockResolvedValueOnce({ statusCode: 201 });
    sendApnsMock.mockResolvedValueOnce({ status: 200, reason: null });
    sendFcmMock.mockRejectedValueOnce(new Error('ECONNRESET'));

    await expect(send()).resolves.toBeUndefined();

    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
    expect(sendApnsMock).toHaveBeenCalledTimes(1);
  });

  it('a failed read of fcm_tokens is logged, and the other channels still go', async () => {
    apnsConfigured = true;
    rows.apns_tokens.push({ id: '1', token: 'a'.repeat(64), environment: 'production' });
    sendApnsMock.mockResolvedValueOnce({ status: 200, reason: null });
    fcmReadError = { message: 'relation does not exist' };

    await expect(send()).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalled();
    expect(sendFcmMock).not.toHaveBeenCalled();
    expect(sendApnsMock).toHaveBeenCalledTimes(1);
  });

  it('FCM unconfigured → fcm_tokens is never read, and the other two go as before', async () => {
    fcmConfigured = false;
    webConfigured = true;
    apnsConfigured = true;
    rows.push_subscriptions.push({ id: '1', endpoint: 'https://push/x', p256dh: 'k', auth: 'a' });
    rows.apns_tokens.push({ id: '1', token: 'a'.repeat(64), environment: 'production' });
    rows.fcm_tokens.push(fcmRow('1'));
    sendNotificationMock.mockResolvedValueOnce({ statusCode: 201 });
    sendApnsMock.mockResolvedValueOnce({ status: 200, reason: null });

    await send();

    expect(tablesQueried).toEqual(['push_subscriptions', 'apns_tokens']);
    expect(sendFcmMock).not.toHaveBeenCalled();
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
    expect(sendApnsMock).toHaveBeenCalledTimes(1);
  });

  it('only FCM configured → it still goes out', async () => {
    rows.fcm_tokens.push(fcmRow('1'));
    sendFcmMock.mockResolvedValueOnce(OK);

    await send();

    expect(tablesQueried).toEqual(['fcm_tokens']);
    expect(sendFcmMock).toHaveBeenCalledTimes(1);
  });

  it('no channel configured → no queries at all', async () => {
    fcmConfigured = false;

    await send();

    expect(tablesQueried).toEqual([]);
  });
});
