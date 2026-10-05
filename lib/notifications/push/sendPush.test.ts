import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendNotificationMock = vi.fn();
vi.mock('../push/vapid', () => ({
  ensureVapid: () => ({ sendNotification: sendNotificationMock }),
  isPushConfigured: () => true,
}));

// Admin client mock: select subs by user_id, delete by endpoint, update last_used_at.
const subsRows: Array<{ id: string; endpoint: string; p256dh: string; auth: string }> = [];
const deleteEqMock = vi.fn().mockResolvedValue({ error: null });
const updateEqMock = vi.fn().mockResolvedValue({ error: null });
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'push_subscriptions') throw new Error(`unexpected ${table}`);
      return {
        select: () => ({ eq: () => Promise.resolve({ data: subsRows, error: null }) }),
        delete: () => ({ eq: deleteEqMock }),
        update: () => ({ eq: updateEqMock }),
      };
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

beforeEach(() => {
  sendNotificationMock.mockReset();
  deleteEqMock.mockClear();
  updateEqMock.mockClear();
  subsRows.length = 0;
});

describe('sendPushToUser', () => {
  it('no subscriptions → does not call web-push', async () => {
    await sendPushToUser({ userId: 'u', kind: 'game_finished', payload: {} as never, locale: 'no' });
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it('a 410 Gone response → prunes that subscription', async () => {
    subsRows.push({ id: '1', endpoint: 'https://push/x', p256dh: 'k', auth: 'a' });
    sendNotificationMock.mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }));
    await sendPushToUser({ userId: 'u', kind: 'game_finished', payload: {} as never, locale: 'no' });
    expect(deleteEqMock).toHaveBeenCalledWith('endpoint', 'https://push/x');
  });

  it('success → marks last_used_at, no prune', async () => {
    subsRows.push({ id: '1', endpoint: 'https://push/x', p256dh: 'k', auth: 'a' });
    sendNotificationMock.mockResolvedValueOnce({ statusCode: 201 });
    await sendPushToUser({ userId: 'u', kind: 'game_finished', payload: {} as never, locale: 'no' });
    expect(updateEqMock).toHaveBeenCalledWith('endpoint', 'https://push/x');
    expect(deleteEqMock).not.toHaveBeenCalled();
  });

  it('#2201: the link carries ?varsel=<id>, so the tap marks that notification read', async () => {
    subsRows.push({ id: '1', endpoint: 'https://push/x', p256dh: 'k', auth: 'a' });
    sendNotificationMock.mockResolvedValueOnce({ statusCode: 201 });
    const id = '5f0c1b2a-3d4e-4f60-8a71-92b3c4d5e6f7';
    await sendPushToUser({
      userId: 'u',
      kind: 'game_finished',
      payload: {} as never,
      locale: 'no',
      notificationId: id,
    });
    const body = JSON.parse(sendNotificationMock.mock.calls[0][1] as string);
    expect(body.url).toBe(`/games/abc?varsel=${id}`);
  });
});
