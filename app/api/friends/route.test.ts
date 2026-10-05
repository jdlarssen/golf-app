// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAdminClientMock, type QueryOp } from '@/lib/supabase/testing/adminClientMock';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

/**
 * Type A (#2256): portene og transporten for appens venne-ruter.
 *
 * Én fil for alle seks rutene under `app/api/friends/`, fordi porten er den
 * samme (`lib/friends/friendRoute.ts` + `authenticatedUserId`) og seks kopier
 * av det samme mock-oppsettet er det test-disiplinen forbyr. Adgangssjekken og
 * kjernen (`lib/friends/friendActionsCore.ts`) er ekte; RPC-ene svarer fra
 * klienten med kallerens token, og grenene i kjernen har sin egen suite.
 *
 * Det som må bevises her: uten gyldig token når ingenting basen; kroppen kan
 * ikke velge hvem handlingen gjelder; og ingen e-postadresse til andre enn
 * kalleren selv går ut av GET.
 */

const ME = 'meg-selv';
const KARI = 'kari';
const TOKEN = 'token-meg';

const fake = createAdminClientMock({
  tokens: { [TOKEN]: ME },
  respond: (op: QueryOp) => {
    if (op.table === 'users') {
      return { data: { name: 'Jørgen', nickname: null, email: 'jorgen@example.com' } };
    }
    if (op.table === 'friendships') return { data: { requester_id: KARI } };
    throw new Error(`uventet spørring: ${op.kind} ${op.table}`);
  },
});
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));

/** Klienten med kallerens token. RPC-svarene settes per test. */
let caller: ReturnType<typeof buildSupabaseMock>;
const callerBuiltFrom: string[] = [];
vi.mock('@/lib/api/appAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/appAuth')>();
  return {
    ...actual,
    callerScopedClient: (req: Request) => {
      callerBuiltFrom.push(req.headers.get('authorization') ?? '');
      return caller;
    },
  };
});

const notifyMock = vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined);
vi.mock('@/lib/notifications/notify', () => ({
  notify: (...args: unknown[]) => notifyMock(...args),
}));
vi.mock('@/lib/mail/inviteNotification', () => ({ sendInviteNotification: vi.fn() }));
vi.mock('@/lib/invitations/quota', () => ({
  getQuotaState: vi.fn(async () => ({ isExhausted: false })),
}));

const getFriendDataMock = vi.fn();
vi.mock('@/lib/friends/getFriendData', () => ({
  getFriendData: (...args: unknown[]) => getFriendDataMock(...args),
}));
const statsMock = vi.fn();
const handicapsMock = vi.fn();
vi.mock('@/lib/friends/getFriendStats', () => ({
  getFriendStats: (...args: unknown[]) => statsMock(...args),
  getFriendHandicaps: (...args: unknown[]) => handicapsMock(...args),
}));
const privateFieldsMock = vi.fn();
vi.mock('@/lib/users/privateUserFields', () => ({
  getPrivateUserFields: (...args: unknown[]) => privateFieldsMock(...args),
}));

import { NextRequest } from 'next/server';
import { GET } from './route';
import { POST as postRequest } from './request/route';
import { POST as postByEmail } from './by-email/route';
import { POST as postRespond } from './respond/route';
import { POST as postRemove } from './remove/route';
import { POST as postInvite } from './invite/route';

function req(path: string, { token, body }: { token?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token !== undefined) headers.authorization = `Bearer ${token}`;
  return new NextRequest(`http://localhost/api/friends${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const KARI_USER = { id: KARI, name: 'Kari Nordmann', nickname: 'Kaka', email: 'kari@example.com' };
const NAMELESS = { id: 'uten-navn', name: null, nickname: null, email: 'nils.hansen@example.com' };

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  callerBuiltFrom.length = 0;
  caller = buildSupabaseMock([]);
  getFriendDataMock.mockResolvedValue({
    friends: [KARI_USER],
    incoming: [{ id: 'req-inn', user: NAMELESS }],
    outgoing: [{ id: 'req-ut', user: { id: 'ola', name: 'Ola', nickname: null, email: 'ola@example.com' } }],
    suggestions: [{ id: 'per', name: 'Per', nickname: null, email: 'per@example.com' }],
  });
  privateFieldsMock.mockResolvedValue(
    new Map([[ME, { email: 'meg@example.com', friendCode: 'KODE123' }]]),
  );
  statsMock.mockResolvedValue(
    new Map([[KARI, { roundsTogether: 8, lastPlayedAt: '2026-09-26T09:00:00Z', lastGameName: 'Onsdagsgolfen' }]]),
  );
  handicapsMock.mockResolvedValue(new Map([[KARI, 9.4]]));
});

const NONE = { roundsTogether: 0, lastPlayedAt: null, lastGameName: null };

describe('GET /api/friends', () => {
  it.each([undefined, 'feil-token'])('svarer 401 uten gyldig token (%p) og leser ingenting', async (token) => {
    const res = await GET(req('', { token }));
    expect(res.status).toBe(401);
    expect(getFriendDataMock).not.toHaveBeenCalled();
  });

  it('gir listene med id, visningsnavn og tallene, og kallerens egen venne-kode', async () => {
    const res = await GET(req('', { token: TOKEN }));
    expect(res.status).toBe(200);
    expect(getFriendDataMock).toHaveBeenCalledWith(ME);
    expect(privateFieldsMock).toHaveBeenCalledWith([ME]);
    expect(statsMock).toHaveBeenCalledWith(ME, [KARI, 'uten-navn', 'ola', 'per']);
    expect(handicapsMock).toHaveBeenCalledWith([KARI]);
    expect(await res.json()).toEqual({
      friends: [
        {
          id: KARI,
          name: 'Kari Nordmann «Kaka»',
          initials: 'KN',
          hcp: 9.4,
          stats: { roundsTogether: 8, lastPlayedAt: '2026-09-26T09:00:00Z', lastGameName: 'Onsdagsgolfen' },
        },
      ],
      incoming: [{ requestId: 'req-inn', id: 'uten-navn', name: expect.any(String), initials: 'N', stats: NONE }],
      outgoing: [{ requestId: 'req-ut', id: 'ola', name: 'Ola', initials: 'O', stats: NONE }],
      suggestions: [{ id: 'per', name: 'Per', initials: 'P', stats: NONE }],
      friendCode: 'KODE123',
    });
  });

  it('hides the handicap of a friend you have no finished round with (#2267)', async () => {
    statsMock.mockResolvedValue(new Map());
    const body = await (await GET(req('', { token: TOKEN }))).json();
    expect(handicapsMock).toHaveBeenCalledWith([KARI]);
    expect(body.friends).toEqual([
      { id: KARI, name: 'Kari Nordmann «Kaka»', initials: 'KN', hcp: null, stats: NONE },
    ]);
  });

  it('puts the suggestion you played most with first (#2267)', async () => {
    getFriendDataMock.mockResolvedValue({
      friends: [],
      incoming: [],
      outgoing: [],
      suggestions: [
        { id: 'anne', name: 'Anne', nickname: null, email: 'anne@example.com' },
        { id: 'bjorn', name: 'Bjørn', nickname: null, email: 'bjorn@example.com' },
        { id: 'cato', name: 'Cato', nickname: null, email: 'cato@example.com' },
      ],
    });
    statsMock.mockResolvedValue(
      new Map([
        ['cato', { roundsTogether: 4, lastPlayedAt: '2026-06-01T09:00:00Z', lastGameName: 'Vår' }],
        ['bjorn', { roundsTogether: 1, lastPlayedAt: '2026-09-01T09:00:00Z', lastGameName: 'Høst' }],
      ]),
    );
    const body = await (await GET(req('', { token: TOKEN }))).json();
    expect(body.suggestions.map((s: { id: string }) => s.id)).toEqual(['cato', 'bjorn', 'anne']);
  });

  it('setter vennen dere spilte med sist først, og resten etter navn', async () => {
    getFriendDataMock.mockResolvedValue({
      friends: [
        { id: 'anne', name: 'Anne', nickname: null, email: 'anne@example.com' },
        { id: 'bjorn', name: 'Bjørn', nickname: null, email: 'bjorn@example.com' },
        KARI_USER,
      ],
      incoming: [],
      outgoing: [],
      suggestions: [],
    });
    statsMock.mockResolvedValue(
      new Map([
        [KARI, { roundsTogether: 1, lastPlayedAt: '2026-06-01T09:00:00Z', lastGameName: 'Vår' }],
        ['bjorn', { roundsTogether: 3, lastPlayedAt: '2026-09-01T09:00:00Z', lastGameName: 'Høst' }],
      ]),
    );
    const body = await (await GET(req('', { token: TOKEN }))).json();
    expect(body.friends.map((f: { id: string }) => f.id)).toEqual(['bjorn', KARI, 'anne']);
  });

  it('gir listene uten tallene når de ikke kan leses', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    statsMock.mockRejectedValue(new Error('nede'));
    const res = await GET(req('', { token: TOKEN }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.friends).toEqual([{ id: KARI, name: 'Kari Nordmann «Kaka»', initials: 'KN', hcp: null, stats: null }]);
    expect(body.suggestions).toEqual([{ id: 'per', name: 'Per', initials: 'P', stats: null }]);
  });

  it('sender ingen e-postadresse til andre ut av serveren', async () => {
    const text = await (await GET(req('', { token: TOKEN }))).text();
    for (const email of ['kari@example.com', 'nils.hansen@example.com', 'ola@example.com', 'per@example.com']) {
      expect(text).not.toContain(email);
    }
  });

  it('skjuler delelenka når venne-koden ikke kan leses', async () => {
    privateFieldsMock.mockRejectedValue(new Error('nede'));
    expect((await (await GET(req('', { token: TOKEN }))).json()).friendCode).toBeNull();
  });
});

const POSTS = [
  ['/request', postRequest, { addresseeId: KARI }, 'send_friend_request', 'requested'],
  ['/by-email', postByEmail, { email: 'Kari@Example.com' }, 'send_friend_request_by_email', { status: 'requested', target_id: KARI }],
  ['/respond', postRespond, { requestId: 'req-1', accept: true }, 'respond_friend_request', 'accepted'],
  ['/remove', postRemove, { otherId: KARI }, 'remove_friend', 'removed'],
] as const;

describe.each(POSTS)('POST /api/friends%s', (path, handler, body, rpcName, rpcResult) => {
  it('svarer 401 uten token og rører ikke basen', async () => {
    const res = await handler(req(path, { body }));
    expect(res.status).toBe(401);
    expect(caller.rpc).not.toHaveBeenCalled();
    expect(callerBuiltFrom).toHaveLength(0);
  });

  it('kjører RPC-en med kallerens token og gir statusen videre', async () => {
    caller = buildSupabaseMock([], { [rpcName]: rpcResult });
    const res = await handler(req(path, { token: TOKEN, body }));
    expect(res.status).toBe(200);
    expect(caller.rpc).toHaveBeenCalledWith(rpcName, expect.any(Object));
    expect(callerBuiltFrom).toEqual([`Bearer ${TOKEN}`]);
    expect(await res.json()).toEqual({
      status: typeof rpcResult === 'string' ? rpcResult : rpcResult.status,
    });
  });

  it('lar ikke en bruker-id i kroppen velge hvem som handler', async () => {
    caller = buildSupabaseMock([], { [rpcName]: rpcResult });
    await handler(req(path, { token: TOKEN, body: { ...body, userId: KARI, actor_id: KARI } }));
    // Den eneste identiteten i kallet er tokenet; varsler bærer tokenets bruker.
    expect(callerBuiltFrom).toEqual([`Bearer ${TOKEN}`]);
    for (const [args] of notifyMock.mock.calls as [{ payload: { actor_id: string } }][]) {
      expect(args.payload.actor_id).toBe(ME);
    }
  });

  it('svarer 500 med en fast kode når noe kaster', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    caller = { rpc: () => { throw new Error('forbindelsen røk'); } } as never;
    const res = await handler(req(path, { token: TOKEN, body }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ status: 'error' });
  });
});

describe('POST /api/friends/respond', () => {
  it('avslår når accept ikke er nøyaktig true', async () => {
    caller = buildSupabaseMock([], { respond_friend_request: 'declined' });
    await postRespond(req('/respond', { token: TOKEN, body: { requestId: 'req-1', accept: 'true' } }));
    expect(caller.rpc).toHaveBeenCalledWith('respond_friend_request', {
      p_request_id: 'req-1',
      p_accept: false,
    });
  });
});

describe('POST /api/friends/invite', () => {
  it('svarer 401 uten token', async () => {
    expect((await postInvite(req('/invite', { body: { email: 'ny@example.com' } }))).status).toBe(401);
  });

  it('gir invitasjonens status, med samme vern som webben', async () => {
    const res = await postInvite(req('/invite', { token: TOKEN, body: { email: 'kast@mailinator.com' } }));
    expect(await res.json()).toEqual({ status: 'disposable_email' });
  });
});
