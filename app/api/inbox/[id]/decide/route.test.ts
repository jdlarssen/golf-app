// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminClientMock, type QueryOp } from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2759): fiendtlige kall mot «Godta»/«Avslå» fra appen. Kjernen
 * (`registrationDecisionCore`) er ekte, så «ikke arrangør» og «låst spill» er
 * den samme regelen som på webben; `approveRegistrationCore` har sin egen suite
 * og er byttet ut bare der suksessveien må sees fra ruta.
 *
 * Det som må bevises: uten token skjer ingenting, en annens varsel gir 404, og
 * `request_id` i kroppen gjør ingenting.
 */

const ME = 'meg-selv';
const TOKEN = 'token-meg';
const NOTE = '11111111-1111-1111-1111-111111111111';
const REQ = '22222222-2222-2222-2222-222222222222';
const OTHER_REQ = '33333333-3333-3333-3333-333333333333';
const GAME = '44444444-4444-4444-4444-444444444444';

let notification: Record<string, unknown> | null = null;
let notificationError: { message: string } | null = null;
let isAdmin = false;
let request: Record<string, unknown> | null = null;
let game: Record<string, unknown> | null = null;

const callerDb = createAdminClientMock({
  respond: (op: QueryOp) => {
    if (op.table === 'notifications' && op.kind === 'select') {
      return notificationError ? { error: notificationError } : { data: notification };
    }
    if (op.table === 'notifications' && op.kind === 'update') return { data: [{ id: NOTE }] };
    if (op.table === 'users') return { data: { is_admin: isAdmin, name: 'Meg' } };
    throw new Error(`uventet spørring som kalleren: ${op.kind} ${op.table}`);
  },
});
const admin = createAdminClientMock({
  tokens: { [TOKEN]: ME },
  respond: (op: QueryOp) => {
    if (op.table === 'game_registration_requests') return { data: request };
    if (op.table === 'games') return { data: game };
    if (op.table === 'notifications' && op.kind === 'update') return { data: [{ id: NOTE }] };
    throw new Error(`uventet spørring med admin-klienten: ${op.kind} ${op.table}`);
  },
});
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => admin.client }));

const callerClient = {
  from: (table: string) => (callerDb.client as unknown as { from(t: string): unknown }).from(table),
  auth: { getUser: async () => ({ data: { user: { id: ME, email: null } }, error: null }) },
};
vi.mock('@/lib/api/appAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/appAuth')>();
  return { ...actual, callerScopedClient: () => callerClient };
});

const approveCore = vi.fn();
vi.mock('@/lib/games/registrationDecisionCore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/games/registrationDecisionCore')>();
  return { ...actual, approveRegistrationCore: (ctx: unknown) => approveCore(ctx) };
});

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));

import { NextRequest } from 'next/server';
import { POST } from './route';

function post(opts: { token?: string; id?: string; body?: unknown } = {}) {
  const { token = TOKEN, id = NOTE, body = { decision: 'approve' } } = opts;
  return POST(
    new NextRequest(`https://t.test/api/inbox/${id}/decide`, {
      method: 'POST',
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

const writes = () =>
  [...callerDb.ops, ...admin.ops].filter((op) => op.kind !== 'select');

beforeEach(() => {
  vi.clearAllMocks();
  callerDb.ops.length = 0;
  admin.ops.length = 0;
  notification = {
    kind: 'registration_request',
    payload: { game_id: GAME, game_name: 'Y', requester_name: 'Kristian Moe «Krille»', request_id: REQ },
  };
  notificationError = null;
  isAdmin = false;
  request = {
    id: REQ,
    game_id: GAME,
    user_id: 'soker',
    status: 'pending',
    is_team_captain: false,
    team_name: null,
    team_request_id: null,
  };
  game = { id: GAME, name: 'Onsdagsgolfen', status: 'scheduled', created_by: ME };
  approveCore.mockResolvedValue({ ok: true, outcome: 'approved', gameId: GAME, gameName: 'Onsdagsgolfen', teamName: null });
});

describe('POST /api/inbox/[id]/decide', () => {
  it('uten token: 401, og ingenting leses eller skrives', async () => {
    const res = await post({ token: '' });
    expect(res.status).toBe(401);
    expect(callerDb.ops).toHaveLength(0);
    expect(admin.ops).toHaveLength(0);
  });

  it('en annens varsel-id: 404 (RLS viser ingen rad), og ingenting skrives', async () => {
    notification = null;
    const res = await post();
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'not_found' });
    expect(approveCore).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(0);
  });

  it('en id som ikke er en uuid: 404 uten spørring', async () => {
    const res = await post({ id: 'ikke-en-uuid' });
    expect(res.status).toBe(404);
    expect(callerDb.ops).toHaveLength(0);
  });

  it.each([
    ['ukjent svar', { decision: 'kanskje' }],
    ['tom kropp', {}],
  ])('%s: 400', async (_name, body) => {
    const res = await post({ body });
    expect(res.status).toBe(400);
    expect(approveCore).not.toHaveBeenCalled();
  });

  it('et varsel uten påmelding å svare på: 400', async () => {
    notification = { kind: 'registration_request', payload: { game_id: GAME, game_name: 'Y', requester_name: 'P' } };
    const res = await post();
    expect(res.status).toBe(400);
    expect(approveCore).not.toHaveBeenCalled();
  });

  it('et varsel av en annen type: 400, også med request_id i payloaden', async () => {
    notification = { kind: 'team_invite', payload: { request_id: REQ } };
    const res = await post();
    expect(res.status).toBe(400);
    expect(approveCore).not.toHaveBeenCalled();
  });

  it('en spiller som ikke er arrangør: 403 `forbidden`, og ingenting skrives', async () => {
    game = { id: GAME, name: 'Onsdagsgolfen', status: 'scheduled', created_by: 'en-annen' };
    const res = await post();
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ reason: 'forbidden' });
    expect(approveCore).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(0);
  });

  it('en admin kan svare på andres spill', async () => {
    isAdmin = true;
    game = { id: GAME, name: 'Onsdagsgolfen', status: 'scheduled', created_by: 'en-annen' };
    expect((await post()).status).toBe(200);
  });

  it('`request_id` i kroppen ignoreres: det er varselets som gjelder', async () => {
    const res = await post({ body: { decision: 'approve', request_id: OTHER_REQ, requestId: OTHER_REQ } });
    expect(res.status).toBe(200);
    const lookup = admin.ops.find((op) => op.table === 'game_registration_requests');
    expect(lookup?.filters).toContainEqual({ op: 'eq', column: 'id', value: REQ });
  });

  it('godkjent: koder og fornavn til appen, og varselet arkiveres som kalleren', async () => {
    const res = await post();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      outcome: 'approved',
      gameName: 'Onsdagsgolfen',
      teamName: null,
      name: 'Kristian',
    });
    const archived = callerDb.ops.find((op) => op.table === 'notifications' && op.kind === 'update');
    expect(archived?.filters).toContainEqual({ op: 'eq', column: 'id', value: NOTE });
    expect(archived?.filters).toContainEqual({ op: 'eq', column: 'user_id', value: ME });
    expect(archived?.payload).toHaveProperty('archived_at');
  });

  it('låst spill: 409 `game_locked`, og varselet blir lest', async () => {
    game = { id: GAME, name: 'Onsdagsgolfen', status: 'active', created_by: ME };
    const res = await post();
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ reason: 'game_locked' });
    expect(approveCore).not.toHaveBeenCalled();
    const marked = admin.ops.find((op) => op.table === 'notifications' && op.kind === 'update');
    expect(marked?.payload).toHaveProperty('read_at');
    expect(marked?.filters).toContainEqual({ op: 'eq', column: 'user_id', value: ME });
  });

  it('slettet spill: 409 `game_not_found`, og varselet blir lest', async () => {
    game = null;
    const res = await post();
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ reason: 'game_not_found' });
    expect(admin.ops.some((op) => op.table === 'notifications' && op.kind === 'update')).toBe(true);
  });

  it('allerede avgjort: 409 `not_pending`, og varselet blir lest', async () => {
    approveCore.mockResolvedValue({ ok: false, reason: 'not_pending', gameId: GAME });
    const res = await post();
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ reason: 'not_pending' });
    expect(admin.ops.some((op) => op.table === 'notifications' && op.kind === 'update')).toBe(true);
  });

  it('`no_team_slot`: 409, og varselet står urørt', async () => {
    approveCore.mockResolvedValue({ ok: false, reason: 'no_team_slot', gameId: GAME });
    const res = await post();
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ reason: 'no_team_slot' });
    expect(writes()).toHaveLength(0);
  });

  it('en lesefeil på varselet: 500', async () => {
    notificationError = { message: 'nede' };
    const res = await post();
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ reason: 'error' });
  });
});
