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

const ownEmailMock = vi.fn(async () => new Map([[ME, { email: 'jorgen@example.com', friendCode: 'kode1234' }]]));
vi.mock('@/lib/users/privateUserFields', () => ({
  getPrivateUserFields: () => ownEmailMock(),
}));

import {
  addByEmail,
  connectByFriendCode,
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
  // #2263: an accepted reverse request is a friendship the other side asked
  // for, so it carries via='accept' and the inbox words it that way.
  it.each([
    ['requested', 'friend_request', { actor_id: ME, actor_name: 'Jørgen' }],
    ['accepted', 'friend_accepted', { actor_id: ME, actor_name: 'Jørgen', via: 'accept' }],
  ] as const)('«%s» varsler mottakeren med %s', async (status, kind, payload) => {
    const client = buildSupabaseMock([], { send_friend_request: status });

    expect(await sendRequest(client as never, ME, OTHER)).toBe(status);
    expect(client.rpc).toHaveBeenCalledWith('send_friend_request', { p_addressee: OTHER });
    expect(notifyMock).toHaveBeenCalledWith({ userId: OTHER, kind, payload });
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

describe('addByEmail (0252)', () => {
  const COMPLETED = { data: { name: 'Jørgen', profile_completed_at: '2026-01-01T00:00:00Z' }, error: null };

  /** The caller's own client: profile, own open invitations, the insert. */
  function callerClient(over: { mine?: unknown[]; invitedElsewhere?: boolean; insertError?: unknown } = {}) {
    return buildSupabaseMock(
      [],
      { email_is_invited: over.invitedElsewhere ?? false },
      {
        byTable: {
          users: [COMPLETED],
          invitations: [{ data: over.mine ?? [], error: null }, { error: over.insertError ?? null }],
        },
      },
    );
  }

  /** What the service-role lookup found. It never leaves the server. */
  function lookupFinds(outcome: string, targetId: string | null) {
    admin = buildSupabaseMock([ACTOR_ROW], {
      friend_request_by_email: { outcome, target_id: targetId },
    });
  }

  /** Collects what the shell hands to `after`, and runs it on demand. */
  function deferred() {
    const tasks: Array<() => Promise<void>> = [];
    return {
      defer: (task: () => Promise<void>) => void tasks.push(task),
      run: async () => {
        for (const task of tasks) await task();
      },
      count: () => tasks.length,
    };
  }

  // The rule the migration exists for: the caller gets one answer and writes
  // one row, whatever the lookup found.
  it.each([
    ['unknown', null],
    ['requested', OTHER],
    ['already_pending', OTHER],
    ['already_friends', OTHER],
    ['accepted', OTHER],
  ] as const)('answers «requested» and writes one invitation row when the lookup finds «%s»', async (outcome, target) => {
    lookupFinds(outcome, target);
    const client = callerClient();
    const later = deferred();

    expect(await addByEmail(client as never, ME, '  Kari@Example.COM ', later.defer)).toBe('requested');
    expect(admin.rpc).toHaveBeenCalledWith('friend_request_by_email', {
      p_requester: ME,
      p_email: 'kari@example.com',
    });
    const inserts = client.__fromCalls.filter((c) => c.method === 'insert');
    expect(inserts).toHaveLength(1);
    expect(inserts[0].args[0]).toEqual(
      expect.objectContaining({ email: 'kari@example.com', invited_by: ME, game_id: null }),
    );
    // Nothing is sent before the answer: the shell runs it afterwards.
    expect(later.count()).toBe(1);
    expect(notifyMock).not.toHaveBeenCalled();
    expect(sendInviteNotificationMock).not.toHaveBeenCalled();
  });

  it('sends the invitation mail to an address without an account, after the answer', async () => {
    lookupFinds('unknown', null);
    const later = deferred();
    await addByEmail(callerClient() as never, ME, 'ny@example.com', later.defer);
    await later.run();

    expect(sendInviteNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ny@example.com', invitedByName: 'Jørgen' }),
    );
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('sends no second mail to an address someone else has an open invitation to (#348)', async () => {
    lookupFinds('unknown', null);
    const later = deferred();
    const client = callerClient({ invitedElsewhere: true });
    expect(await addByEmail(client as never, ME, 'ny@example.com', later.defer)).toBe('requested');
    await later.run();

    expect(sendInviteNotificationMock).not.toHaveBeenCalled();
    expect(client.__fromCalls.filter((c) => c.method === 'insert')).toHaveLength(1);
  });

  it.each([
    ['requested', 'friend_request'],
    ['accepted', 'friend_accepted'],
  ] as const)('notifies the person when the lookup finds «%s», and sends no mail', async (outcome, kind) => {
    lookupFinds(outcome, OTHER);
    const later = deferred();
    await addByEmail(callerClient() as never, ME, 'kari@example.com', later.defer);
    await later.run();

    expect(notifyMock).toHaveBeenCalledWith(expect.objectContaining({ userId: OTHER, kind }));
    expect(sendInviteNotificationMock).not.toHaveBeenCalled();
  });

  it.each(['already_pending', 'already_friends'] as const)(
    'sends nothing when the lookup finds «%s»',
    async (outcome) => {
      lookupFinds(outcome, OTHER);
      const later = deferred();
      await addByEmail(callerClient() as never, ME, 'kari@example.com', later.defer);
      await later.run();
      expect(notifyMock).not.toHaveBeenCalled();
      expect(sendInviteNotificationMock).not.toHaveBeenCalled();
    },
  );

  it('answers «requested» and does nothing more when the caller already asked this address', async () => {
    lookupFinds('requested', OTHER);
    const client = callerClient({ mine: [{ id: 'inv-1' }] });
    const later = deferred();
    expect(await addByEmail(client as never, ME, 'kari@example.com', later.defer)).toBe('requested');
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(client.__fromCalls.filter((c) => c.method === 'insert')).toHaveLength(0);
    expect(later.count()).toBe(0);
  });

  // What stops the action before the lookup depends on the caller and on the
  // address as typed, never on who has an account.
  it.each([
    ['   ', 'email_required'],
    ['ikke-en-adresse', 'invalid_email'],
    ['kast@mailinator.com', 'disposable_email'],
  ] as const)('stops on %p with «%s» before anything is asked', async (email, status) => {
    lookupFinds('requested', OTHER);
    const client = callerClient();
    expect(await addByEmail(client as never, ME, email, deferred().defer)).toBe(status);
    expect(client.__fromCalls).toHaveLength(0);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it('asks for a completed profile first', async () => {
    lookupFinds('requested', OTHER);
    const client = buildSupabaseMock([{ data: { name: null, profile_completed_at: null }, error: null }]);
    expect(await addByEmail(client as never, ME, 'kari@example.com', deferred().defer)).toBe('profile_incomplete');
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it('answers «self» for the caller\'s own address without a lookup', async () => {
    lookupFinds('self', ME);
    expect(await addByEmail(callerClient() as never, ME, 'Jorgen@Example.com', deferred().defer)).toBe('self');
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it('stops on the daily limit before the lookup', async () => {
    lookupFinds('requested', OTHER);
    quotaMock.mockResolvedValueOnce({ isExhausted: true });
    const client = callerClient();
    expect(await addByEmail(client as never, ME, 'kari@example.com', deferred().defer)).toBe('quota');
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(client.__fromCalls.filter((c) => c.method === 'insert')).toHaveLength(0);
  });

  it('answers «error» and sends nothing when the lookup fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    admin = buildSupabaseMock([], {}, { rpcErrors: { friend_request_by_email: { message: 'nede' } } });
    const client = callerClient();
    const later = deferred();
    expect(await addByEmail(client as never, ME, 'kari@example.com', later.defer)).toBe('error');
    expect(client.__fromCalls.filter((c) => c.method === 'insert')).toHaveLength(0);
    expect(later.count()).toBe(0);
  });

  it('answers «error» and sends nothing when the row is not written', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    lookupFinds('unknown', null);
    const later = deferred();
    const client = callerClient({ insertError: { message: 'nede' } });
    expect(await addByEmail(client as never, ME, 'ny@example.com', later.defer)).toBe('error');
    expect(later.count()).toBe(0);
  });

  it('keeps the answer when the mail fails afterwards', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    sendInviteNotificationMock.mockRejectedValueOnce(new Error('resend nede'));
    lookupFinds('unknown', null);
    const later = deferred();
    expect(await addByEmail(callerClient() as never, ME, 'ny@example.com', later.defer)).toBe('requested');
    await expect(later.run()).resolves.toBeUndefined();
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
    expect(notifyMock).toHaveBeenCalledWith({
      userId: OTHER,
      kind: 'friend_accepted',
      payload: { actor_id: ME, actor_name: 'Jørgen', via: 'accept' },
    });
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

// #2627: the friend link's connect, shared by the web landing page and the
// app's `POST /api/friends/link/[code]`.
describe('connectByFriendCode', () => {
  it('«connected» blir «accepted» og varsler eieren med via=link', async () => {
    const client = buildSupabaseMock([], {
      connect_via_friend_code: { owner_id: OTHER, status: 'connected' },
    });
    expect(await connectByFriendCode(client as never, ME, 'abcd1234')).toBe('accepted');
    expect(client.rpc).toHaveBeenCalledWith('connect_via_friend_code', { p_code: 'abcd1234' });
    expect(notifyMock).toHaveBeenCalledWith({
      userId: OTHER,
      kind: 'friend_accepted',
      payload: { actor_id: ME, actor_name: 'Jørgen', via: 'link' },
    });
  });

  it.each(['already_friends', 'self'] as const)('«%s» gis videre, uten varsel', async (status) => {
    const client = buildSupabaseMock([], {
      connect_via_friend_code: { owner_id: OTHER, status },
    });
    expect(await connectByFriendCode(client as never, ME, 'abcd1234')).toBe(status);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('gir «error» når RPC-en kaster (også en ukjent kode), uten varsel', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = buildSupabaseMock([], {}, {
      rpcErrors: { connect_via_friend_code: { message: 'code_not_found' } },
    });
    expect(await connectByFriendCode(client as never, ME, 'ukjent00')).toBe('error');
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('gir «error» for en tom kode uten å spørre basen', async () => {
    const client = buildSupabaseMock([], {});
    expect(await connectByFriendCode(client as never, ME, '')).toBe('error');
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('lar en varselfeil aldri velte koblingen', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    notifyMock.mockRejectedValueOnce(new Error('nede'));
    const client = buildSupabaseMock([], {
      connect_via_friend_code: { owner_id: OTHER, status: 'connected' },
    });
    expect(await connectByFriendCode(client as never, ME, 'abcd1234')).toBe('accepted');
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

// The route older app builds call after a «not on Tørny» answer. That answer
// is gone; the route now does what «add by e-mail» does, with their codes.
describe('inviteByEmail (the route for app builds from before 0252)', () => {
  const COMPLETED = { data: { name: 'Jørgen', profile_completed_at: '2026-01-01T00:00:00Z' }, error: null };
  const noDefer = () => {};
  const client = () =>
    buildSupabaseMock([], { email_is_invited: false }, {
      byTable: { users: [COMPLETED], invitations: [{ data: [], error: null }, { error: null }] },
    });

  it.each(['unknown', 'requested'] as const)('answers «invited» whatever the lookup finds (%s)', async (outcome) => {
    admin = buildSupabaseMock([ACTOR_ROW], {
      friend_request_by_email: { outcome, target_id: outcome === 'unknown' ? null : OTHER },
    });
    expect(await inviteByEmail(client() as never, ME, 'Ny@Example.com', noDefer)).toEqual({
      status: 'invited',
      email: 'ny@example.com',
    });
  });

  it('gives the address problems and the limit their own codes', async () => {
    expect((await inviteByEmail(client() as never, ME, 'kast@mailinator.com', noDefer)).status).toBe(
      'disposable_email',
    );
    quotaMock.mockResolvedValueOnce({ isExhausted: true });
    expect((await inviteByEmail(client() as never, ME, 'ny@example.com', noDefer)).status).toBe('quota');
  });

  it('answers «unknown» for the caller\'s own address', async () => {
    expect((await inviteByEmail(client() as never, ME, 'jorgen@example.com', noDefer)).status).toBe('unknown');
  });
});
