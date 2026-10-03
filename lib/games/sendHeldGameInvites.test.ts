import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock, type QueryResult } from '@/tests/serverActionMocks';

/**
 * Type A (#2445, orchestrator's decision 03.10): the e-mail invitations a
 * draft held go out once when it is published.
 *
 * The real `extendAndMailInvitation` runs; the mail is mocked at the boundary
 * and the service client is the shared double. Reads are sequential (game,
 * invitations, inviters), then one deadline write per invitation in list order.
 */

const sendInviteNotificationMock =
  vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined);
vi.mock('@/lib/mail/inviteNotification', () => ({
  sendInviteNotification: (...args: unknown[]) => sendInviteNotificationMock(...args),
}));

let adminMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminMock,
}));

import { sendHeldGameInvites } from './sendHeldGameInvites';

const GAME_ID = '33333333-3333-3333-3333-333333333333';
const ORGANISER = '11111111-1111-1111-1111-111111111111';
const ADMIN = '55555555-5555-5555-5555-555555555555';
const CAPTAIN = '66666666-6666-6666-6666-666666666666';

function game(overrides: Record<string, unknown> = {}): QueryResult {
  return {
    data: {
      id: GAME_ID,
      name: 'Tirsdagsrunden',
      game_mode: 'stableford',
      status: 'scheduled',
      created_by: ORGANISER,
      ...overrides,
    },
    error: null,
  };
}

function invitation(id: string, email: string, invitedBy = ORGANISER) {
  return { id, email, token: `token-${id}`, invited_by: invitedBy };
}

const INVITERS: QueryResult = {
  data: [
    { id: ORGANISER, name: 'Kari', is_admin: false },
    { id: ADMIN, name: 'Jørgen', is_admin: true },
    { id: CAPTAIN, name: 'Ola', is_admin: false },
  ],
  error: null,
};

const EXTENDED: QueryResult = { data: [{ id: 'x' }], error: null };

async function run(queue: QueryResult[], skipEmails: string[] = []) {
  adminMock = buildSupabaseMock(queue);
  return sendHeldGameInvites({ gameId: GAME_ID, skipEmails });
}

function mailedTokens(): string[] {
  return sendInviteNotificationMock.mock.calls.map(
    (c) => (c[0] as { inviteToken: string }).inviteToken,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('sendHeldGameInvites', () => {
  it("mails the organiser's two held invitations, each after its own fresh deadline", async () => {
    const before = Date.now();
    const result = await run([
      game(),
      { data: [invitation('a', 'a@example.com'), invitation('b', 'b@example.com')], error: null },
      INVITERS,
      EXTENDED,
      EXTENDED,
    ]);

    expect(result).toEqual({ sent: 2, failed: 0 });
    expect(mailedTokens()).toEqual(['token-a', 'token-b']);
    const updates = adminMock.__fromCalls.filter((c) => c.method === 'update');
    expect(updates).toHaveLength(2);
    for (const [i, call] of sendInviteNotificationMock.mock.calls.entries()) {
      const mail = call[0] as Record<string, unknown>;
      expect(mail).toMatchObject({
        invitedByName: 'Kari',
        gameName: 'Tirsdagsrunden',
        gameMode: 'stableford',
      });
      // The mail carries the deadline the write just stamped, and it is new.
      const stamped = (updates[i]!.args[0] as { expires_at: string }).expires_at;
      expect(mail.expiresAt).toBe(stamped);
      expect(Date.parse(stamped)).toBeGreaterThan(before);
    }
    // Each deadline write lands before the first mail goes out.
    expect(adminMock.from.mock.invocationCallOrder.at(-1)).toBeLessThan(
      sendInviteNotificationMock.mock.invocationCallOrder[0]!,
    );
  });

  it('reads the unaccepted invitations on the game with NO deadline filter, so an expired held one is sent', async () => {
    await run([
      game(),
      {
        // expires_at in the past: a held invitation was never sent.
        data: [{ ...invitation('old', 'old@example.com'), expires_at: '2020-01-01T00:00:00.000Z' }],
        error: null,
      },
      INVITERS,
      EXTENDED,
    ]);

    const invitationReads = adminMock.__fromCalls.filter(
      (c) => c.table === 'invitations' && c.method !== 'update',
    );
    expect(invitationReads).toEqual(
      expect.arrayContaining([
        { table: 'invitations', method: 'eq', args: ['game_id', GAME_ID] },
        { table: 'invitations', method: 'is', args: ['accepted_at', null] },
      ]),
    );
    expect(
      adminMock.__fromCalls.some((c) => c.args.some((a) => a === 'expires_at')),
    ).toBe(false);
    expect(mailedTokens()).toEqual(['token-old']);
  });

  it("skips a team captain's invitation, and sends a global admin's on someone else's game", async () => {
    const result = await run([
      game(),
      {
        data: [
          invitation('captain', 'lag@example.com', CAPTAIN),
          invitation('admin', 'admin-inv@example.com', ADMIN),
        ],
        error: null,
      },
      INVITERS,
      EXTENDED,
    ]);

    expect(result).toEqual({ sent: 1, failed: 0 });
    expect(mailedTokens()).toEqual(['token-admin']);
    expect(sendInviteNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ invitedByName: 'Jørgen' }),
    );
  });

  it('skips an address the caller mails itself, whatever its case', async () => {
    const result = await run(
      [
        game(),
        { data: [invitation('a', 'a@example.com'), invitation('b', 'b@example.com')], error: null },
        INVITERS,
        EXTENDED,
      ],
      ['  A@Example.COM '],
    );

    expect(result).toEqual({ sent: 1, failed: 0 });
    expect(mailedTokens()).toEqual(['token-b']);
  });

  it.each([
    ['a draft', game({ status: 'draft' })],
    ['a missing game', { data: null, error: null }],
  ])('%s sends nothing and reads no invitations', async (_label, gameResult) => {
    const result = await run([gameResult as QueryResult]);

    expect(result).toEqual({ sent: 0, failed: 0 });
    expect(sendInviteNotificationMock).not.toHaveBeenCalled();
    expect(adminMock.__fromCalls.some((c) => c.table === 'invitations')).toBe(false);
  });

  it('one rejected mail never stops the other', async () => {
    sendInviteNotificationMock.mockRejectedValueOnce(new Error('Resend 500'));

    const result = await run([
      game(),
      { data: [invitation('a', 'a@example.com'), invitation('b', 'b@example.com')], error: null },
      INVITERS,
      EXTENDED,
      EXTENDED,
    ]);

    expect(result).toEqual({ sent: 1, failed: 1 });
    expect(sendInviteNotificationMock).toHaveBeenCalledTimes(2);
  });

  it('a deadline write that matches 0 rows sends no mail for that invitation and counts as failed', async () => {
    const result = await run([
      game(),
      { data: [invitation('a', 'a@example.com'), invitation('b', 'b@example.com')], error: null },
      INVITERS,
      { data: [], error: null }, // a was accepted meanwhile
      EXTENDED,
    ]);

    expect(result).toEqual({ sent: 1, failed: 1 });
    expect(mailedTokens()).toEqual(['token-b']);
  });

  it.each([
    ['the game read', [{ data: null, error: { message: 'boom' } }]],
    ['the invitations read', [game(), { data: null, error: { message: 'boom' } }]],
  ])('an error in %s throws instead of sending nothing (#1445)', async (_label, queue) => {
    await expect(run(queue as QueryResult[])).rejects.toMatchObject({ message: 'boom' });
    expect(sendInviteNotificationMock).not.toHaveBeenCalled();
  });
});
