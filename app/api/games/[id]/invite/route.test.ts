// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAdminClientMock,
  type QueryOp,
  type QueryResponse,
} from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#1919): rutas port og transport.
 *
 * Hverken adgangssjekken (`lib/api/appAuth.ts`) eller invitasjons-kjernen
 * (`lib/games/inviteToGame.ts`) er stubbet her — samme linje som
 * `remind/route.test.ts` og `withdraw-self/route.test.ts`. Grunnen: dette er en
 * auth-flate, og det som må bevises er at lagene henger sammen i praksis — at
 * et avvist token aldri når kjernen, og at en fremmed aldri får vite noe om en
 * annens runde.
 *
 * `@/lib/admin/rateLimit` MÅ mockes: dobbelen har ingen `rpc`, så den ekte
 * limiteren ville fail-open-et til `true` og 429-tilfellet aldri kjørt — og
 * `headers()` finnes ikke utenfor en request-scope i vitest.
 *
 * Det fila bevisst IKKE re-assertererer: grenene i kjernen (eksisterende bruker
 * vs. ukjent adresse, idempotensen, mail-rollbacken) — de har sin egen Type
 * A-suite i `lib/games/inviteToGame.test.ts`.
 */

const GAME_ID = '22222222-2222-2222-2222-222222222222';
const ORGANISER = '11111111-1111-1111-1111-111111111111';
const STRANGER = '99999999-9999-9999-9999-999999999999';
const OTHER_GAME = '88888888-8888-8888-8888-888888888888';

const ORGANISER_TOKEN = 'token-arrangor';
const STRANGER_TOKEN = 'token-fremmed';

let db: {
  /** `false` = spillet finnes ikke. */
  gameExists: boolean;
  status: string;
  /** `users.is_admin` per bruker-id. */
  admins: Record<string, boolean>;
  /** Adressen har alt en konto. */
  registered: string | null;
  /** Radene som ble skrevet, så et negativt bevis er billig. */
  inserted: Array<{ table: string; payload: Record<string, unknown> | null }>;
  /** Settes for å bevise at et kast fra kjernen blir 500, ikke en halv 200. */
  coreThrows: boolean;
};

function respond(op: QueryOp): QueryResponse {
  const value = (column: string) =>
    op.filters.find((f) => f.column === column)?.value;

  if (op.table === 'games') {
    if (db.coreThrows) throw new Error('connection reset');
    return {
      data:
        db.gameExists && value('id') === GAME_ID
          ? {
              id: GAME_ID,
              // `gameOrganiserAccess` leser denne; kjernen leser resten.
              created_by: ORGANISER,
              name: 'Tirsdagsrunden',
              status: db.status,
              game_mode: 'stroke_play',
              group_id: null,
              mode_config: null,
            }
          : null,
    };
  }

  if (op.table === 'users') {
    const id = value('id');
    if (id !== undefined) {
      return { data: { id, is_admin: db.admins[String(id)] === true, name: 'Kari' } };
    }
    // Adresse-oppslaget i kjernen.
    return { data: db.registered ? { id: db.registered } : null };
  }

  if (op.table === 'invitations') {
    if (op.kind === 'insert') {
      db.inserted.push({ table: op.table, payload: op.payload });
      return { data: { id: 'invitation-1' } };
    }
    return { data: null };
  }

  if (op.table === 'game_players') {
    if (op.kind === 'insert') {
      db.inserted.push({ table: op.table, payload: op.payload });
      return { data: null };
    }
    return { data: null, count: 0 };
  }

  throw new Error(`uventet spørring: ${op.kind} ${op.table}`);
}

const fake = createAdminClientMock({
  tokens: { [ORGANISER_TOKEN]: ORGANISER, [STRANGER_TOKEN]: STRANGER },
  respond: (op) => respond(op),
});

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => fake.client,
}));
// Kjernen revaliderer selv, og `revalidateTag` kaster utenfor en Next-request.
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));
vi.mock('@/lib/notifications/notifyInvitedToGame', () => ({
  notifyInvitedToGame: vi.fn(async () => undefined),
}));

const sendInviteNotificationMock =
  vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined);
vi.mock('@/lib/mail/inviteNotification', () => ({
  sendInviteNotification: (...args: unknown[]) =>
    sendInviteNotificationMock(...args),
}));

const rateLimitMock = vi.fn<() => Promise<boolean>>(async () => true);
vi.mock('@/lib/admin/rateLimit', () => ({
  consumeAdminInviteRateLimit: (...args: unknown[]) => rateLimitMock(...(args as [])),
  getClientIp: async () => '203.0.113.7',
}));

import { NextRequest } from 'next/server';
import { POST } from './route';

function request({
  token,
  query = '',
  body = { email: 'ny@example.com' },
}: { token?: string; query?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token !== undefined) headers.authorization = token;
  return new NextRequest(
    `http://localhost/api/games/${GAME_ID}/invite${query}`,
    {
      method: 'POST',
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
}

/** Rute-konteksten Next gir handleren — `params` er en Promise i Next 16. */
const ctx = () => ({ params: Promise.resolve({ id: GAME_ID }) });

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  rateLimitMock.mockResolvedValue(true);
  db = {
    gameExists: true,
    status: 'scheduled',
    admins: {},
    registered: null,
    inserted: [],
    coreThrows: false,
  };
});

describe('porten', () => {
  it('uten Authorization-header: 401 før noe leses', async () => {
    const res = await POST(request(), ctx());

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
    // Ingen GoTrue-rundtur heller — headeren avvises lokalt.
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

  it('en fremmed: 403, og ingen spørring om spillerne i runden', async () => {
    const res = await POST(request({ token: `Bearer ${STRANGER_TOKEN}` }), ctx());

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'forbidden' });
    // Gaten leste `games.created_by` og `users.is_admin` for å svare — men
    // ingenting om rosteret, invitasjonene eller adressen.
    expect(fake.ops.some((op) => op.table === 'game_players')).toBe(false);
    expect(fake.ops.some((op) => op.table === 'invitations')).toBe(false);
    expect(sendInviteNotificationMock).not.toHaveBeenCalled();
  });

  it('ukjent spill-id: 404, også for en admin', async () => {
    // Ukjent svares som ukjent for ALLE, ellers lekker 404-vs-403 hvem som er
    // admin til en tilfeldig kaller.
    db.gameExists = false;
    db.admins[STRANGER] = true;

    const res = await POST(request({ token: `Bearer ${STRANGER_TOKEN}` }), ctx());

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'not_found' });
  });

  it('rate-limit slår inn: 429, og kjernen kjører aldri', async () => {
    rateLimitMock.mockResolvedValue(false);

    const res = await POST(request({ token: `Bearer ${ORGANISER_TOKEN}` }), ctx());

    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toEqual({ error: 'rate_limited' });
    expect(db.inserted).toEqual([]);
    expect(sendInviteNotificationMock).not.toHaveBeenCalled();
    // Bøtta er kallerens egen, ikke en id fra kroppen.
    expect(rateLimitMock).toHaveBeenCalledWith({
      adminId: ORGANISER,
      ip: '203.0.113.7',
    });
  });
});

describe('invitasjonen', () => {
  it('ukjent adresse: 200 { status: sent }, rad + mail', async () => {
    const res = await POST(request({ token: `Bearer ${ORGANISER_TOKEN}` }), ctx());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: 'sent' });
    expect(db.inserted).toEqual([
      {
        table: 'invitations',
        payload: expect.objectContaining({
          email: 'ny@example.com',
          game_id: GAME_ID,
          invited_by: ORGANISER,
        }),
      },
    ]);
    expect(sendInviteNotificationMock).toHaveBeenCalledTimes(1);
  });

  it('en uleselig kropp er 400 invalid_email, aldri 500', async () => {
    const res = await POST(
      request({ token: `Bearer ${ORGANISER_TOKEN}`, body: 'ikke json' }),
      ctx(),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'invalid_email' });
  });

  it('en igangsatt runde: 409 game_locked', async () => {
    db.status = 'active';

    const res = await POST(request({ token: `Bearer ${ORGANISER_TOKEN}` }), ctx());

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: 'game_locked' });
  });

  it('en bruker-id og et spill i kroppen og queryen har NULL effekt', async () => {
    // Bruker-id-en kommer utelukkende fra tokenet, spill-id-en utelukkende fra
    // stien. Finnes det ingen id å bytte ut, finnes det ingen vei inn i en
    // annens runde — kroppen bærer bare adressen.
    const res = await POST(
      request({
        token: `Bearer ${ORGANISER_TOKEN}`,
        query: `?userId=${STRANGER}&gameId=${OTHER_GAME}`,
        body: {
          email: 'ny@example.com',
          userId: STRANGER,
          gameId: OTHER_GAME,
          invited_by: STRANGER,
          isAdmin: true,
        },
      }),
      ctx(),
    );

    expect(res.status).toBe(200);
    expect(db.inserted[0]?.payload).toMatchObject({
      game_id: GAME_ID,
      invited_by: ORGANISER,
    });
    for (const op of fake.ops) {
      const gameFilter = op.filters.find(
        (f) => f.column === 'game_id' || (f.column === 'id' && op.table === 'games'),
      );
      if (gameFilter) expect(gameFilter.value).toBe(GAME_ID);
    }
  });

  it('en `isAdmin` i kroppen gir ikke admin-unntakene', async () => {
    // Rolle-lesingen går mot den EKTE kalleren. Ville kroppen blitt trodd, var
    // venne-scopingen i kjernen omgåelig med ett felt — og på denne stien er
    // den den eneste håndhevelsen (service-role no-op-er 0115-triggeren).
    const res = await POST(
      request({
        token: `Bearer ${ORGANISER_TOKEN}`,
        body: { email: 'kast@mailinator.com', isAdmin: true },
      }),
      ctx(),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'disposable_email' });
  });

  it('et kast fra kjernen blir 500 med en ugjennomsiktig kode', async () => {
    // Endepunktet er offentlig eksponert, så `err.message` (Postgres-detaljer,
    // env-navn) skal aldri ut.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    db.coreThrows = true;

    const res = await POST(request({ token: `Bearer ${ORGANISER_TOKEN}` }), ctx());

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'invite_failed' });
  });
});
