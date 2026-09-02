// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAdminClientMock,
  type QueryOp,
  type QueryResponse,
} from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#1891): rutas port og transport.
 *
 * Hverken adgangssjekken (`lib/api/appAuth.ts`) eller purre-kjernen
 * (`lib/games/remindUnsubmitted.ts`) er stubbet her — bare Supabase og
 * mail-sendingen er det. Grunnen: dette er en auth-flate, og det som må bevises
 * er at de tre lagene henger sammen i praksis — at et avvist token aldri når
 * kjernen, at en fremmed aldri utløser en spørring om andres spillere, og at en
 * POST faktisk ender i en påminnelse og et stempel.
 *
 * Det fila bevisst IKKE re-asserterer: mål-regelen (hvem som er ferdig uten å
 * ha levert) og «hvem er arrangør» — begge har egne Type A-suiter i
 * `lib/games/remindUnsubmitted.test.ts` og `lib/api/appAuth.test.ts`. Her er
 * fikstur-spillet med vilje trivielt: én som skal purres, én som ikke skal.
 */

const GAME_ID = 'spill-1';
const CREATOR = 'oppretteren';
const STRANGER = 'en-fremmed';

const CREATOR_TOKEN = 'token-arrangor';
const STRANGER_TOKEN = 'token-spiller';

type PlayerRow = {
  user_id: string;
  submitted_at: string | null;
  withdrawn_at: string | null;
  deliver_reminder_sent_at: string | null;
  users: {
    email: string | null;
    name: string | null;
    locale: string | null;
    is_guest: boolean;
  } | null;
};

function player(
  user_id: string,
  overrides: Partial<Omit<PlayerRow, 'user_id'>> = {},
): PlayerRow {
  return {
    user_id,
    submitted_at: null,
    withdrawn_at: null,
    deliver_reminder_sent_at: null,
    users: {
      email: `${user_id}@example.test`,
      name: user_id,
      locale: 'no',
      is_guest: false,
    },
    ...overrides,
  };
}

let db: {
  /** `null` = spillet finnes ikke (gjelder både port-oppslaget og kjernens). */
  gameExists: boolean;
  status: string;
  players: PlayerRow[];
  scores: { user_id: string }[];
  /** Settes for å bevise at et kast fra kjernen blir 500, ikke en halv 200. */
  coreThrows: boolean;
};

function respond(op: QueryOp): QueryResponse {
  const value = (column: string) =>
    op.filters.find((f) => f.column === column)?.value;

  if (op.table === 'games') {
    // Portens oppslag ber kun om `created_by`; kjernens ber om hele raden.
    if (op.columns === 'created_by') {
      return { data: db.gameExists ? { created_by: CREATOR } : null };
    }
    if (db.coreThrows) throw new Error('connection reset');
    return {
      data:
        db.gameExists && value('id') === GAME_ID
          ? {
              id: GAME_ID,
              name: 'Tirsdagsrunden',
              status: db.status,
              hole_segment: 'full',
              tournament_id: null,
              scheduled_tee_off_at: '2026-09-02T08:00:00+00:00',
              created_at: '2026-09-01T18:00:00+00:00',
            }
          : null,
    };
  }
  if (op.table === 'users') return { data: { is_admin: false } };
  if (op.table === 'scores') return { data: db.scores };
  if (op.table === 'game_players' && op.kind === 'update') {
    return { data: [{ user_id: 'ferdig' }] };
  }
  if (op.table === 'game_players') return { data: db.players };
  throw new Error(`uventet spørring: ${op.kind} ${op.table}`);
}

const fake = createAdminClientMock({
  tokens: { [CREATOR_TOKEN]: CREATOR, [STRANGER_TOKEN]: STRANGER },
  respond: (op) => respond(op),
});

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => fake.client,
}));
vi.mock('@/lib/notifications/deliveryReminder', () => ({
  sendDeliveryReminder: vi.fn(),
}));

import { NextRequest } from 'next/server';
import { sendDeliveryReminder } from '@/lib/notifications/deliveryReminder';
import { GET, POST } from './route';

const reminderMock = vi.mocked(sendDeliveryReminder);

function request(
  method: 'GET' | 'POST',
  {
    token,
    query = '',
    body,
  }: { token?: string; query?: string; body?: unknown } = {},
) {
  const headers: Record<string, string> = {};
  if (token !== undefined) headers.authorization = token;
  return new NextRequest(`http://localhost/api/games/${GAME_ID}/remind${query}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

/** Rute-konteksten Next gir handleren — `params` er en Promise i Next 16. */
const ctx = () => ({ params: Promise.resolve({ id: GAME_ID }) });

/** Kjernen ble aldri rørt: ingen spillere lest, ingen mail, ingen skriving. */
function expectCoreNeverRan() {
  expect(fake.ops.map((op) => op.table)).not.toContain('scores');
  expect(fake.ops.map((op) => op.table)).not.toContain('game_players');
  expect(reminderMock).not.toHaveBeenCalled();
}

/** Brukerne som faktisk fikk en påminnelse, i rekkefølge. */
function remindedUserIds() {
  return reminderMock.mock.calls.map((c) => c[0].player.userId);
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  db = {
    gameExists: true,
    status: 'active',
    players: [player('ferdig'), player('midt-i')],
    scores: [
      ...Array.from({ length: 18 }, () => ({ user_id: 'ferdig' })),
      ...Array.from({ length: 11 }, () => ({ user_id: 'midt-i' })),
    ],
    coreThrows: false,
  };
});

describe('porten', () => {
  it.each(['GET', 'POST'] as const)(
    '%s uten Authorization-header: 401 før noe leses',
    async (method) => {
      const handler = method === 'GET' ? GET : POST;

      const res = await handler(request(method), ctx());

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
      // Ingen GoTrue-rundtur heller — headeren avvises lokalt.
      expect(fake.getUserCalls).toEqual([]);
      expect(fake.ops).toEqual([]);
      expectCoreNeverRan();
    },
  );

  it.each(['GET', 'POST'] as const)(
    '%s med et token GoTrue avviser: 401, ingenting kjøres',
    async (method) => {
      const handler = method === 'GET' ? GET : POST;

      const res = await handler(
        request(method, { token: 'Bearer utgatt-token' }),
        ctx(),
      );

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
      // Tokenet ble faktisk sendt til validering — koblingen er bevist.
      expect(fake.getUserCalls).toEqual(['utgatt-token']);
      expect(fake.ops).toEqual([]);
      expectCoreNeverRan();
    },
  );

  it.each(['GET', 'POST'] as const)(
    '%s fra en innlogget spiller som ikke er arrangør: 403',
    async (method) => {
      const handler = method === 'GET' ? GET : POST;

      const res = await handler(
        request(method, { token: `Bearer ${STRANGER_TOKEN}` }),
        ctx(),
      );

      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({ error: 'forbidden' });
      // En fremmed skal ikke engang få vite hvor mange som mangler levering.
      expectCoreNeverRan();
    },
  );

  it.each(['GET', 'POST'] as const)('%s mot et ukjent spill: 404', async (method) => {
    const handler = method === 'GET' ? GET : POST;
    db.gameExists = false;

    const res = await handler(
      request(method, { token: `Bearer ${CREATOR_TOKEN}` }),
      ctx(),
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'not_found' });
    expectCoreNeverRan();
  });

  it.each(['GET', 'POST'] as const)(
    '%s mot en runde som ikke er i gang: 409 not_active',
    async (method) => {
      const handler = method === 'GET' ? GET : POST;
      db.status = 'finished';

      const res = await handler(
        request(method, { token: `Bearer ${CREATOR_TOKEN}` }),
        ctx(),
      );

      expect(res.status).toBe(409);
      await expect(res.json()).resolves.toEqual({ error: 'not_active' });
      expect(reminderMock).not.toHaveBeenCalled();
      expect(fake.ops.filter((op) => op.kind === 'update')).toEqual([]);
    },
  );
});

describe('GET — hva purringen ville truffet', () => {
  it('svarer med antall mål og når noen sist ble purret', async () => {
    db.players = [
      player('ferdig', { deliver_reminder_sent_at: '2026-09-02T10:00:00+00:00' }),
      player('midt-i'),
    ];

    const res = await GET(request('GET', { token: `Bearer ${CREATOR_TOKEN}` }), ctx());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      targets: 1,
      lastRemindedAt: '2026-09-02T10:00:00+00:00',
    });
    // Ren forhåndsvisning: ingenting sendes, ingenting skrives.
    expect(reminderMock).not.toHaveBeenCalled();
    expect(fake.ops.filter((op) => op.kind === 'update')).toEqual([]);
  });

  it('en spill-id i query-strengen ignoreres — stien er kilden', async () => {
    const res = await GET(
      request('GET', {
        token: `Bearer ${CREATOR_TOKEN}`,
        query: '?id=et-annet-spill&gameId=et-annet-spill',
      }),
      ctx(),
    );

    expect(res.status).toBe(200);
    // Hvert eneste spill-oppslag gjaldt id-en fra stien.
    const gameIds = fake.ops
      .flatMap((op) => op.filters)
      .filter((f) => f.column === 'id' || f.column === 'game_id')
      .map((f) => f.value);
    expect(gameIds.length).toBeGreaterThan(0);
    expect(new Set(gameIds)).toEqual(new Set([GAME_ID]));
  });
});

describe('POST — purringen', () => {
  it('sender kun til målene og stempler dem', async () => {
    const res = await POST(request('POST', { token: `Bearer ${CREATOR_TOKEN}` }), ctx());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ reminded: 1 });
    expect(remindedUserIds()).toEqual(['ferdig']);

    const [stamp, ...extra] = fake.ops.filter((op) => op.kind === 'update');
    expect(extra).toEqual([]);
    expect(stamp.table).toBe('game_players');
    expect(Object.keys(stamp.payload ?? {})).toEqual(['deliver_reminder_sent_at']);
    expect(stamp.filters).toEqual([
      { op: 'eq', column: 'game_id', value: GAME_ID },
      { op: 'in', column: 'user_id', value: ['ferdig'] },
    ]);
  });

  it('en bruker- eller spill-id i body ignoreres', async () => {
    const res = await POST(
      request('POST', {
        token: `Bearer ${CREATOR_TOKEN}`,
        query: '?gameId=et-annet-spill',
        body: { gameId: 'et-annet-spill', userId: STRANGER },
      }),
      ctx(),
    );

    // Svaret følger stien og tokenet: purringen gjaldt spill-1, ikke det
    // spillet body-en pekte på.
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ reminded: 1 });
    expect(remindedUserIds()).toEqual(['ferdig']);
    const gameIds = fake.ops
      .flatMap((op) => op.filters)
      .filter((f) => f.column === 'id' || f.column === 'game_id')
      .map((f) => f.value);
    expect(new Set(gameIds)).toEqual(new Set([GAME_ID]));
  });
});

describe('feil under panseret', () => {
  it.each(['GET', 'POST'] as const)(
    '%s: kjernen kaster → 500 med en ugjennomsiktig kode',
    async (method) => {
      const handler = method === 'GET' ? GET : POST;
      db.coreThrows = true;
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const res = await handler(
        request(method, { token: `Bearer ${CREATOR_TOKEN}` }),
        ctx(),
      );

      expect(res.status).toBe(500);
      // Aldri `err.message` på tråden — endepunktet er offentlig eksponert.
      await expect(res.json()).resolves.toEqual({ error: 'remind_failed' });
      expect(errorSpy).toHaveBeenCalledWith(
        method === 'GET'
          ? '[api/games/[id]/remind] preview failed'
          : '[api/games/[id]/remind] remind threw',
        expect.any(Error),
      );
      expect(reminderMock).not.toHaveBeenCalled();
    },
  );
});
