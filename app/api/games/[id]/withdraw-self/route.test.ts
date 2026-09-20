// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAdminClientMock,
  type QueryOp,
  type QueryResponse,
} from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#1917): rutas port og transport.
 *
 * Hverken adgangssjekken (`lib/api/appAuth.ts`) eller frafalls-kjernen
 * (`lib/games/withdrawSelf.ts`) er stubbet her — bare Supabase, og de to
 * Next-modulene kjernen ikke kan kjøre utenfor en request (`next/cache`) eller
 * skal kjøre i en test (`notify`). Grunnen: dette er en auth-flate, og det som
 * må bevises er at lagene henger sammen i praksis — at et avvist token aldri
 * når kjernen, og at en POST faktisk setter `withdrawn_at` på KALLERENS rad og
 * ingen annens.
 *
 * Porten her er `authenticatedUserId` ALENE. Det er ikke en forglemmelse: en
 * spiller trekker seg fra SIN egen rad, bruker-id-en kommer kun fra tokenet og
 * spill-id-en kun fra stien, og kjernen filtrerer hver skriving på begge. Testen
 * «POST med en annen bruker-id og et annet spill i kroppen» er beviset for at
 * det faktisk stemmer — den er hele autorisasjonsargumentet, satt på prøve.
 *
 * Det fila bevisst IKKE re-asserterer: grenene i kjernen (mykt trekk vs.
 * sletting, cup-sperren, kaptein-varselet) og «hvem er du» — de har egne Type
 * A-suiter i `lib/games/withdrawSelf.test.ts` og `lib/api/appAuth.test.ts`.
 */

const GAME_ID = '22222222-2222-2222-2222-222222222222';
const PLAYER = '11111111-1111-1111-1111-111111111111';
const OTHER = '99999999-9999-9999-9999-999999999999';
const OTHER_GAME = '88888888-8888-8888-8888-888888888888';

const PLAYER_TOKEN = 'token-spiller';

let db: {
  /** `false` = spillet finnes ikke. */
  gameExists: boolean;
  status: string;
  gameMode: string;
  /** Radene i `game_players`, nøkkel = user_id. */
  players: Record<string, { withdrawn_at: string | null }>;
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
              name: 'Tirsdagsrunden',
              short_id: 'abc12345',
              status: db.status,
              game_mode: db.gameMode,
              tournament_id: null,
            }
          : null,
    };
  }

  if (op.table === 'game_players') {
    const userId = String(value('user_id'));
    if (op.kind === 'update') {
      const row = db.players[userId];
      if (!row) return { data: [] };
      // Skrivingen utføres, så neste lesing ser resultatet — det er dette som
      // gjør «POST satte feltet på KALLERENS rad» til et ekte bevis.
      row.withdrawn_at =
        (op.payload?.withdrawn_at as string | null) ?? null;
      return { data: [{ user_id: userId }] };
    }
    const row = db.players[userId];
    return { data: row ? { user_id: userId, ...row } : null };
  }

  throw new Error(`uventet spørring: ${op.kind} ${op.table}`);
}

const fake = createAdminClientMock({
  tokens: { [PLAYER_TOKEN]: PLAYER },
  respond: (op) => respond(op),
});

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => fake.client,
}));
// Kjernen revaliderer selv, og `revalidateTag` kaster utenfor en Next-request.
// `remind/route.test.ts` slipper unna fordi purre-kjernen ikke revaliderer.
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));
vi.mock('@/lib/notifications/notify', () => ({
  notify: vi.fn(async () => ({ shouldAlsoSendMail: false })),
}));

import { NextRequest } from 'next/server';
import { DELETE, POST } from './route';

function request(
  method: 'POST' | 'DELETE',
  {
    token,
    query = '',
    body,
  }: { token?: string; query?: string; body?: unknown } = {},
) {
  const headers: Record<string, string> = {};
  if (token !== undefined) headers.authorization = token;
  return new NextRequest(
    `http://localhost/api/games/${GAME_ID}/withdraw-self${query}`,
    {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
}

/** Rute-konteksten Next gir handleren — `params` er en Promise i Next 16. */
const ctx = () => ({ params: Promise.resolve({ id: GAME_ID }) });

/** Kjernen ble aldri rørt: ingen spørringer i det hele tatt. */
function expectCoreNeverRan() {
  expect(fake.ops).toEqual([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  db = {
    gameExists: true,
    status: 'active',
    gameMode: 'best_ball',
    players: { [PLAYER]: { withdrawn_at: null }, [OTHER]: { withdrawn_at: null } },
    coreThrows: false,
  };
});

describe('porten', () => {
  it.each(['POST', 'DELETE'] as const)(
    '%s uten Authorization-header: 401 før noe leses',
    async (method) => {
      const handler = method === 'POST' ? POST : DELETE;

      const res = await handler(request(method), ctx());

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
      // Ingen GoTrue-rundtur heller — headeren avvises lokalt.
      expect(fake.getUserCalls).toEqual([]);
      expectCoreNeverRan();
    },
  );

  it.each(['POST', 'DELETE'] as const)(
    '%s med et token GoTrue avviser: 401, ingenting kjøres',
    async (method) => {
      const handler = method === 'POST' ? POST : DELETE;

      const res = await handler(
        request(method, { token: 'Bearer utgatt-token' }),
        ctx(),
      );

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
      // Tokenet ble faktisk sendt til validering — koblingen er bevist.
      expect(fake.getUserCalls).toEqual(['utgatt-token']);
      expectCoreNeverRan();
    },
  );

  it('POST mot et ukjent spill: 404', async () => {
    db.gameExists = false;

    const res = await POST(
      request('POST', { token: `Bearer ${PLAYER_TOKEN}` }),
      ctx(),
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'not_found' });
  });

  it('POST fra en som ikke står i runden: 403, ikke 404', async () => {
    // Én status = én kode: 404 betyr «spillet finnes ikke». Kollapset de to,
    // måtte appen lest `error`-feltet for å skille dem.
    db.players = {};

    const res = await POST(
      request('POST', { token: `Bearer ${PLAYER_TOKEN}` }),
      ctx(),
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'not_registered' });
  });

  it('POST i en avsluttet runde: 409', async () => {
    db.status = 'finished';

    const res = await POST(
      request('POST', { token: `Bearer ${PLAYER_TOKEN}` }),
      ctx(),
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: 'game_locked' });
  });
});

describe('handlingen', () => {
  it('POST setter withdrawn_at på kallerens rad', async () => {
    const res = await POST(
      request('POST', { token: `Bearer ${PLAYER_TOKEN}` }),
      ctx(),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, kept: true });
    expect(db.players[PLAYER]!.withdrawn_at).not.toBeNull();
    // Og ingen andres rad ble rørt.
    expect(db.players[OTHER]!.withdrawn_at).toBeNull();
  });

  it('DELETE nuller feltet igjen', async () => {
    db.players[PLAYER] = { withdrawn_at: '2026-06-01T10:00:00.000Z' };

    const res = await DELETE(
      request('DELETE', { token: `Bearer ${PLAYER_TOKEN}` }),
      ctx(),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, kept: true });
    expect(db.players[PLAYER]!.withdrawn_at).toBeNull();
  });

  it('DELETE når du ikke er trukket: 403', async () => {
    const res = await DELETE(
      request('DELETE', { token: `Bearer ${PLAYER_TOKEN}` }),
      ctx(),
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'not_registered' });
  });

  it('en bruker-id og et spill i kroppen og queryen har NULL effekt', async () => {
    // Dette ER autorisasjonsargumentet: bruker-id-en kommer utelukkende fra
    // tokenet, spill-id-en utelukkende fra stien. Finnes det ingen id å bytte
    // ut, finnes det ingen vei til en annens rad — og porten trenger ikke mer.
    const res = await POST(
      request('POST', {
        token: `Bearer ${PLAYER_TOKEN}`,
        query: `?userId=${OTHER}&gameId=${OTHER_GAME}`,
        body: { userId: OTHER, gameId: OTHER_GAME, game_id: OTHER_GAME },
      }),
      ctx(),
    );

    expect(res.status).toBe(200);
    expect(db.players[PLAYER]!.withdrawn_at).not.toBeNull();
    expect(db.players[OTHER]!.withdrawn_at).toBeNull();
    // Hver spørring gikk mot stiens spill og tokenets bruker, ingen andre.
    for (const op of fake.ops) {
      const gameFilter = op.filters.find(
        (f) => f.column === 'game_id' || f.column === 'id',
      );
      if (gameFilter) expect(gameFilter.value).toBe(GAME_ID);
      const userFilter = op.filters.find((f) => f.column === 'user_id');
      if (userFilter) expect(userFilter.value).toBe(PLAYER);
    }
  });

  it('et kast fra kjernen blir 500 med en ugjennomsiktig kode', async () => {
    // Endepunktet er offentlig eksponert, så `err.message` (Postgres-detaljer,
    // env-navn) skal aldri ut.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    db.coreThrows = true;

    const res = await POST(
      request('POST', { token: `Bearer ${PLAYER_TOKEN}` }),
      ctx(),
    );

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'withdraw_failed' });
  });
});
