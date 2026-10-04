import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock, type QueryResult } from '@/tests/serverActionMocks';

/**
 * Type A (#2445): «extend, then send» has one home. The three callers (the
 * e-mail core, `sendHeldGameInvites`, `resendInvitation`) each prove what an
 * outcome means at their door; this file proves the outcomes themselves.
 */

const sendInviteNotificationMock =
  vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined);
vi.mock('@/lib/mail/inviteNotification', () => ({
  sendInviteNotification: (...args: unknown[]) => sendInviteNotificationMock(...args),
}));

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { extendAndMailInvitation } from './extendAndMailInvitation';

const EXPIRES_AT = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
const MAIL = {
  to: 'ny@example.com',
  invitedByName: 'Kari',
  gameName: 'Tirsdagsrunden',
  gameMode: 'stroke_play',
  inviteToken: 'token-1',
};

async function run(extendResult: QueryResult, mail: typeof MAIL | null = MAIL) {
  const client = buildSupabaseMock([extendResult]);
  const result = await extendAndMailInvitation({
    client: client as unknown as SupabaseClient<Database>,
    invitationId: 'invitation-1',
    expiresAt: EXPIRES_AT,
    mail,
    label: 'test.extendExpiry',
  });
  return { result, client };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('extendAndMailInvitation', () => {
  it.each([
    {
      label: 'mail null: extended, and no mail',
      extend: { data: [{ id: 'invitation-1' }], error: null },
      mail: null,
      mailThrows: false,
      expected: 'extended',
      mailed: false,
    },
    {
      label: 'the extension matches 0 rows: extend_failed, and no mail',
      extend: { data: [], error: null },
      mail: MAIL,
      mailThrows: false,
      expected: 'extend_failed',
      mailed: false,
    },
    {
      label: 'the extension fails: extend_failed, and no mail',
      extend: { data: null, error: { message: 'permission denied' } },
      mail: MAIL,
      mailThrows: false,
      expected: 'extend_failed',
      mailed: false,
    },
    {
      label: 'the mail throws: mail_failed',
      extend: { data: [{ id: 'invitation-1' }], error: null },
      mail: MAIL,
      mailThrows: true,
      expected: 'mail_failed',
      mailed: true,
    },
    {
      label: 'otherwise: sent',
      extend: { data: [{ id: 'invitation-1' }], error: null },
      mail: MAIL,
      mailThrows: false,
      expected: 'sent',
      mailed: true,
    },
  ])('$label', async ({ extend, mail, mailThrows, expected, mailed }) => {
    if (mailThrows) sendInviteNotificationMock.mockRejectedValueOnce(new Error('Resend 500'));

    const { result } = await run(extend, mail);

    expect(result).toBe(expected);
    expect(sendInviteNotificationMock).toHaveBeenCalledTimes(mailed ? 1 : 0);
  });

  it('extends this unaccepted row BEFORE the mail, and the mail carries the new deadline', async () => {
    const { client } = await run({ data: [{ id: 'invitation-1' }], error: null });

    expect(client.__fromCalls).toEqual(
      expect.arrayContaining([
        { table: 'invitations', method: 'update', args: [{ expires_at: EXPIRES_AT }] },
        { table: 'invitations', method: 'eq', args: ['id', 'invitation-1'] },
        { table: 'invitations', method: 'is', args: ['accepted_at', null] },
      ]),
    );
    expect(sendInviteNotificationMock).toHaveBeenCalledWith({ ...MAIL, expiresAt: EXPIRES_AT });
    expect(client.from.mock.invocationCallOrder[0]).toBeLessThan(
      sendInviteNotificationMock.mock.invocationCallOrder[0]!,
    );
  });
});
