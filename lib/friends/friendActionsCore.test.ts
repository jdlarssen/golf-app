// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

/**
 * Type A (#2256): kjernen bak vennehandlingene. Webbens server-handlinger og
 * appens serverruter kaller begge disse funksjonene, så reglene her er de
 * samme på begge flatene: hvilken status spilleren får, og hvem som varsles.
 *
 * Grensene: RPC-ene (`send_friend_request` m.fl.) er Postgres sine, og her
 * svarer mocken som dem. `notify` og mailen er stubbet — de er best-effort,
 * og det som må bevises er at de kalles med riktig mottaker og aldri velter
 * handlingen.
 */

const ME = 'meg';
const OTHER = 'kari';

let admin: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => admin }));

const notifyMock = vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined);
vi.mock('@/lib/notifications/notify', () => ({
  notify: (...args: unknown[]) => notifyMock(...args),
}));

const sendInviteNotificationMock = vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined);
vi.mock('@/lib/mail/inviteNotification', () => ({
  sendInviteNotification: (...args: unknown[]) => sendInviteNotificationMock(...args),
}));

const quotaMock = vi.fn(async () => ({ isExhausted: false }));
vi.mock('@/lib/invitations/quota', () => ({
  getQuotaState: () => quotaMock(),
}));

import {
  addByEmail,
  inviteByEmail,
  inviteEmailProblem,
  remove,
  respond,
  sendRequest,
} from './friendActionsCore';

/** Avsenderens navn slik varselet skal bære det (maskert e-post, #2271). */
const ACTOR_ROW = { data: { name: 'Jørgen', nickname: null, email: 'jorgen@example.com' }, error: null };

beforeEach(() => {
  vi.clearAllMocks();
  admin = buildSupabaseMock([ACTOR_ROW]);
});

describe('sendRequest', () => {
  it.each([
    ['requested', 'friend_request'],
    ['accepted', 'friend_accepted'],
  ] as const)('«%s» varsler mottakeren med %s', async (status, kind) => {
    const client = buildSupabaseMock([], { send_friend_request: status });

    expect(await sendRequest(client as never, ME, OTHER)).toBe(status);
    expect(client.rpc).toHaveBeenCalledWith('send_friend_request', { p_addressee: OTHER });
    expect(notifyMock).toHaveBeenCalledWith({
      userId: OTHER,
      kind,
      payload: { actor_id: ME, actor_name: 'Jørgen' },
    });
  });

  it.each(['already_friends', 'already_pending', 'self', 'not_found'] as const)(
    '«%s» går videre uten varsel',
    async (status) => {
      const client = buildSupabaseMock([], { send_friend_request: status });
      expect(await sendRequest(client as never, ME, OTHER)).toBe(status);
      expect(notifyMock).not.toHaveBeenCalled();
    },
  );

  it('gir «error» og varsler ingen når RPC-en feiler', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = buildSupabaseMock([], {}, { rpcErrors: { send_friend_request: { message: 'nede' } } });
    expect(await sendRequest(client as never, ME, OTHER)).toBe('error');
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('gir «error» uten å spørre når mottakeren mangler', async () => {
    const client = buildSupabaseMock([]);
    expect(await sendRequest(client as never, ME, '')).toBe('error');
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('gjør en ukjent status fra basen til «error»', async () => {
    const client = buildSupabaseMock([], { send_friend_request: 'noe_nytt' });
    expect(await sendRequest(client as never, ME, OTHER)).toBe('error');
  });

  it('lar ikke et feilet varsel velte forespørselen', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    notifyMock.mockRejectedValueOnce(new Error('mail nede'));
    const client = buildSupabaseMock([], { send_friend_request: 'requested' });
    expect(await sendRequest(client as never, ME, OTHER)).toBe('requested');
  });
});

describe('addByEmail', () => {
  it('sender adressen i små bokstaver og varsler den som fikk forespørselen', async () => {
    const client = buildSupabaseMock([], {
      send_friend_request_by_email: { status: 'requested', target_id: OTHER },
    });

    expect(await addByEmail(client as never, ME, '  Kari@Example.COM ')).toBe('requested');
    expect(client.rpc).toHaveBeenCalledWith('send_friend_request_by_email', {
      p_email: 'kari@example.com',
    });
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: OTHER, kind: 'friend_request' }),
    );
  });

  it('svarer «not_found» for en ukjent adresse, uten varsel', async () => {
    const client = buildSupabaseMock([], {
      send_friend_request_by_email: { status: 'not_found', target_id: null },
    });
    expect(await addByEmail(client as never, ME, 'ukjent@example.com')).toBe('not_found');
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('svarer «email_required» uten å spørre når adressen er tom', async () => {
    const client = buildSupabaseMock([]);
    expect(await addByEmail(client as never, ME, '   ')).toBe('email_required');
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('gir «error» når RPC-en feiler', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = buildSupabaseMock([], {}, {
      rpcErrors: { send_friend_request_by_email: { message: 'nede' } },
    });
    expect(await addByEmail(client as never, ME, 'kari@example.com')).toBe('error');
  });
});

describe('respond', () => {
  it('varsler den som spurte når forespørselen godtas', async () => {
    admin = buildSupabaseMock([{ data: { requester_id: OTHER }, error: null }, ACTOR_ROW]);
    const client = buildSupabaseMock([], { respond_friend_request: 'accepted' });

    expect(await respond(client as never, ME, 'req-1', true)).toBe('accepted');
    expect(client.rpc).toHaveBeenCalledWith('respond_friend_request', {
      p_request_id: 'req-1',
      p_accept: true,
    });
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: OTHER, kind: 'friend_accepted' }),
    );
  });

  it.each(['declined', 'already_decided', 'not_found'] as const)('«%s» varsler ingen', async (status) => {
    admin = buildSupabaseMock([{ data: { requester_id: OTHER }, error: null }]);
    const client = buildSupabaseMock([], { respond_friend_request: status });
    expect(await respond(client as never, ME, 'req-1', false)).toBe(status);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('gir «error» når RPC-en feiler', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    admin = buildSupabaseMock([{ data: { requester_id: OTHER }, error: null }]);
    const client = buildSupabaseMock([], {}, { rpcErrors: { respond_friend_request: { message: 'nede' } } });
    expect(await respond(client as never, ME, 'req-1', true)).toBe('error');
    expect(notifyMock).not.toHaveBeenCalled();
  });
});

describe('remove', () => {
  it.each(['removed', 'not_found'] as const)('gir «%s» videre, uten varsel', async (status) => {
    const client = buildSupabaseMock([], { remove_friend: status });
    expect(await remove(client as never, OTHER)).toBe(status);
    expect(client.rpc).toHaveBeenCalledWith('remove_friend', { p_other: OTHER });
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('gir «error» når RPC-en feiler', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = buildSupabaseMock([], {}, { rpcErrors: { remove_friend: { message: 'nede' } } });
    expect(await remove(client as never, OTHER)).toBe('error');
  });
});

describe('inviteEmailProblem', () => {
  it.each([
    ['', 'email_required'],
    ['uten-krøllalfa', 'invalid_email'],
    ['kast@mailinator.com', 'disposable_email'],
    ['ny@example.com', null],
  ] as const)('%p → %p', (email, problem) => {
    expect(inviteEmailProblem(email)).toBe(problem);
  });
});

describe('inviteByEmail', () => {
  const COMPLETED = { data: { name: 'Jørgen', profile_completed_at: '2026-01-01T00:00:00Z' }, error: null };
  const NOBODY = { email_is_registered: false, email_is_in_auth_users: false, email_is_invited: false };

  it('lager invitasjonen og sender mailen', async () => {
    const client = buildSupabaseMock([COMPLETED, { error: null }], NOBODY);

    expect(await inviteByEmail(client as never, ME, 'Ny@Example.com')).toEqual({
      status: 'invited',
      email: 'ny@example.com',
    });
    expect(client.__fromCalls.filter((c) => c.method === 'insert')).toHaveLength(1);
    expect(sendInviteNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ny@example.com', invitedByName: 'Jørgen' }),
    );
  });

  it('stopper på en engangsadresse før basen spørres', async () => {
    const client = buildSupabaseMock([]);
    expect((await inviteByEmail(client as never, ME, 'kast@mailinator.com')).status).toBe(
      'disposable_email',
    );
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('ber om fullført profil først', async () => {
    const client = buildSupabaseMock([{ data: { name: null, profile_completed_at: null }, error: null }]);
    expect((await inviteByEmail(client as never, ME, 'ny@example.com')).status).toBe('profile_incomplete');
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('stopper når kvoten er brukt opp', async () => {
    quotaMock.mockResolvedValueOnce({ isExhausted: true });
    const client = buildSupabaseMock([COMPLETED], NOBODY);
    expect((await inviteByEmail(client as never, ME, 'ny@example.com')).status).toBe('quota');
    expect(sendInviteNotificationMock).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...NOBODY, email_is_registered: true }, 'already_user'],
    [{ ...NOBODY, email_is_in_auth_users: true }, 'already_user'],
    [{ ...NOBODY, email_is_invited: true }, 'already_invited'],
  ] as const)('sender ingen mail når adressen alt er kjent (%o)', async (rpc, status) => {
    const client = buildSupabaseMock([COMPLETED], rpc);
    expect((await inviteByEmail(client as never, ME, 'kjent@example.com')).status).toBe(status);
    expect(client.__fromCalls.filter((c) => c.method === 'insert')).toHaveLength(0);
    expect(sendInviteNotificationMock).not.toHaveBeenCalled();
  });

  it('holder invitasjonen når mailen feiler', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    sendInviteNotificationMock.mockRejectedValueOnce(new Error('resend nede'));
    const client = buildSupabaseMock([COMPLETED, { error: null }], NOBODY);
    expect((await inviteByEmail(client as never, ME, 'ny@example.com')).status).toBe('invited');
  });
});
