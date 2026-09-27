// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAdminClientMock,
  type QueryOp,
  type QueryResponse,
} from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2215): rutas port og transport.
 *
 * Hverken adgangssjekken (`lib/api/appAuth.ts`), kjernen
 * (`lib/games/notifyRosterInvites.ts`) eller varsel-helperen
 * (`notifyInvitedToGame`) er stubbet — bare Supabase og `notify`. Kjernen
 * varsler med service-role, så porten her er den eneste tilgangssjekken: det
 * som må bevises er at en fremmed aldri får sendt et eneste varsel.
 *
 * Mottaker-regelen (gjester, trukne, dedupen) har sin egen suite i
 * `lib/games/notifyRosterInvites.test.ts`.
 */

const GAME_ID = '22222222-2222-2222-2222-222222222222';
const ORGANISER = '11111111-1111-1111-1111-111111111111';
const OLA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STRANGER = '99999999-9999-9999-9999-999999999999';
const CLUB_ADMIN = '77777777-7777-7777-7777-777777777777';
const OTHER_GAME = '88888888-8888-8888-8888-888888888888';

const ORGANISER_TOKEN = 'token-arrangor';
const STRANGER_TOKEN = 'token-fremmed';
const ADMIN_TOKEN = 'token-admin';

let db: {
  gameExists: boolean;
  status: string;
  admins: Record<string, boolean>;
  /** Settes for å bevise at et kast blir 500, ikke en halv 200. */
  coreThrows: boolean;
};

function respond(op: QueryOp): QueryResponse {
  const value = (column: string) =>
    op.filters.find((f) => f.column === column)?.value;

  if (op.table === 'games') {
    if (db.coreThrows && op.columns !== 'created_by') {
      throw new Error('connection reset');
    }
    return {
      data:
        db.gameExists && value('id') === GAME_ID
          ? { id: GAME_ID, created_by: ORGANISER, name: 'Tirsdagsrunden', status: db.status }
          : null,
    };
  }
  if (op.table === 'game_players') {
    return { data: [{ user_id: ORGANISER }, { user_id: OLA }] };
  }
  if (op.table === 'users') {
    const id = value('id');
    // `findGuestIds` spør med `.in` — ingen gjester her.
    if (Array.isArray(id)) return { data: [] };
    return { data: { id, is_admin: db.admins[String(id)] === true, name: 'Kari', email: null } };
  }
  if (op.table === 'notifications') return { data: [] };
  throw new Error(`uventet spørring: ${op.kind} ${op.table}`);
}

const fake = createAdminClientMock({
  tokens: {
    [ORGANISER_TOKEN]: ORGANISER,
    [STRANGER_TOKEN]: STRANGER,
    [ADMIN_TOKEN]: CLUB_ADMIN,
  },
  respond: (op) => respond(op),
});

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => fake.client,
}));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));
vi.mock('@/lib/notifications/notify', () => ({
  notify: vi.fn(async () => ({ shouldAlsoSendMail: false })),
}));

import { NextRequest } from 'next/server';
import { revalidateTag } from 'next/cache';
import { notify } from '@/lib/notifications/notify';
import { POST } from './route';

const notifyMock = vi.mocked(notify);

function request({
  token,
  query = '',
  body,
}: { token?: string; query?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = {};
  if (token !== undefined) headers.authorization = token;
  return new NextRequest(
    `http://localhost/api/games/${GAME_ID}/invite-roster${query}`,
    {
      method: 'POST',
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
}

const ctx = () => ({ params: Promise.resolve({ id: GAME_ID }) });

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  db = {
    gameExists: true,
    status: 'scheduled',
    admins: { [CLUB_ADMIN]: true },
    coreThrows: false,
  };
});

describe('porten', () => {
  it('uten Authorization-header: 401 før noe leses', async () => {
    const res = await POST(request(), ctx());

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
    expect(fake.getUserCalls).toEqual([]);
    expect(fake.ops).toEqual([]);
  });

  it('med et token GoTrue avviser: 401, ingenting kjøres', async () => {
    const res = await POST(request({ token: 'Bearer utgatt-token' }), ctx());

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
    expect(fake.getUserCalls).toEqual(['utgatt-token']);
    expect(fake.ops).toEqual([]);
  });

  it('en fremmed: 403, ingen varsler og rosteret er aldri lest', async () => {
    const res = await POST(request({ token: `Bearer ${STRANGER_TOKEN}` }), ctx());

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'forbidden' });
    expect(notifyMock).not.toHaveBeenCalled();
    expect(fake.ops.some((op) => op.table === 'game_players')).toBe(false);
  });

  it('ukjent spill-id: 404, også for en admin', async () => {
    db.gameExists = false;

    const res = await POST(request({ token: `Bearer ${ADMIN_TOKEN}` }), ctx());

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'not_found' });
    expect(notifyMock).not.toHaveBeenCalled();
  });
});

describe('POST — utsendingen', () => {
  it('arrangøren: 200 { invited }, invite til medspilleren og tømt cache', async () => {
    const res = await POST(request({ token: `Bearer ${ORGANISER_TOKEN}` }), ctx());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ invited: 1 });
    expect(notifyMock).toHaveBeenCalledExactlyOnceWith({
      userId: OLA,
      kind: 'invite',
      payload: expect.objectContaining({ game_id: GAME_ID, game_name: 'Tirsdagsrunden' }),
    });
    expect(revalidateTag).toHaveBeenCalledWith(`game-${GAME_ID}`, { expire: 0 });
  });

  it('en igangsatt runde: 409 game_locked, ingen varsler', async () => {
    db.status = 'active';

    const res = await POST(request({ token: `Bearer ${ORGANISER_TOKEN}` }), ctx());

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: 'game_locked' });
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('spill- og bruker-id i kropp og query har NULL effekt', async () => {
    const res = await POST(
      request({
        token: `Bearer ${ORGANISER_TOKEN}`,
        query: `?gameId=${OTHER_GAME}&inviterUserId=${STRANGER}`,
        body: { gameId: OTHER_GAME, inviterUserId: STRANGER, userId: STRANGER },
      }),
      ctx(),
    );

    expect(res.status).toBe(200);
    for (const op of fake.ops) {
      const gameFilter = op.filters.find(
        (f) =>
          f.column === 'game_id' ||
          f.column === 'payload->>game_id' ||
          (f.column === 'id' && op.table === 'games'),
      );
      if (gameFilter) expect(gameFilter.value).toBe(GAME_ID);
    }
    // Kalleren (fra tokenet) varsles aldri; en id i kroppen blir ikke kalleren.
    expect(notifyMock.mock.calls.map(([n]) => n.userId)).toEqual([OLA]);
  });

  it('et kast fra kjernen blir 500 med en ugjennomsiktig kode', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.coreThrows = true;

    const res = await POST(request({ token: `Bearer ${ORGANISER_TOKEN}` }), ctx());

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'invite_failed' });
    expect(errorSpy).toHaveBeenCalledWith(
      '[api/games/[id]/invite-roster] invite-roster threw',
      expect.any(Error),
    );
    expect(notifyMock).not.toHaveBeenCalled();
  });
});
