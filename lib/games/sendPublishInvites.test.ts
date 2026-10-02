import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

// The core is the system boundary here: its own tests cover what one address does.
const coreMock = vi.fn();
vi.mock('@/lib/games/inviteToGame', () => ({
  inviteEmailToGameCore: (...args: unknown[]) => coreMock(...args),
}));

const client = { tag: 'request-client' } as unknown as SupabaseClient<Database>;

function params(emails: string[]) {
  return {
    client,
    viewer: client,
    gameId: 'game-1',
    inviterUserId: 'organiser-1',
    inviterName: 'Ola',
    isAdmin: false,
    emails,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('sendPublishInvites', () => {
  it('sends nothing for no addresses', async () => {
    const { sendPublishInvites } = await import('./sendPublishInvites');
    await expect(sendPublishInvites(params([]))).resolves.toEqual({ failed: 0 });
    expect(coreMock).not.toHaveBeenCalled();
  });

  it("passes the caller's client, viewer, isAdmin and inviter on for each address", async () => {
    coreMock.mockResolvedValue({ ok: true, kind: 'sent', email: 'x' });
    const { sendPublishInvites } = await import('./sendPublishInvites');

    await sendPublishInvites(params(['a@example.com', 'b@example.com']));

    expect(coreMock).toHaveBeenCalledTimes(2);
    for (const [call] of coreMock.mock.calls) {
      expect(call).toMatchObject({
        gameId: 'game-1',
        inviterUserId: 'organiser-1',
        inviterName: 'Ola',
        isAdmin: false,
      });
      expect(call.client).toBe(client);
      expect(call.viewer).toBe(client);
    }
    expect(coreMock.mock.calls.map(([c]) => c.rawEmail)).toEqual(['a@example.com', 'b@example.com']);
  });

  it('counts refusals and rejected promises as failures, and never throws', async () => {
    coreMock
      .mockResolvedValueOnce({ ok: true, kind: 'added', email: 'a@example.com' })
      .mockResolvedValueOnce({ ok: false, reason: 'disposable_email' })
      .mockRejectedValueOnce(new Error('network'));
    const { sendPublishInvites } = await import('./sendPublishInvites');

    await expect(
      sendPublishInvites(params(['a@example.com', 'b@example.com', 'c@example.com'])),
    ).resolves.toEqual({ failed: 2 });
  });
});
