// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAdminClientMock,
  type QueryOp,
  type QueryResponse,
} from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#1918, #2200): rutas port og transport.
 *
 * Hverken adgangssjekken (`lib/api/appAuth.ts`) eller leverings-kjernen
 * (`lib/games/submitScorecardCore.ts`) er stubbet her — bare Supabase, varslene
 * og mailen er det. Grunnen: dette er en auth-flate uten arrangør-sjekk, så det
 * som må bevises er at de tre lagene henger sammen i praksis — at et avvist
 * token aldri når kjernen, at en som ikke er med i spillet ikke får skrevet en
 * eneste rad, og at en POST faktisk markerer hele laget.
 *
 * #2200 la til makkerne i `alsoFor`: den eneste id-lista i kroppen, og den kan
 * bare snevre inn. Her bevises at en feilformet liste gir 400 før noe leses,
 * og at en forfalsket id aldri utvider settet som leveres.
 *
 * Det fila bevisst IKKE re-asserterer: leverings-regelen selv (idempotens,
 * lag-deteksjon, varsel-mottakere, hvem som kan leveres for flighten), som har
 * sine egne Type A-suiter i `lib/games/submitScorecardCore.test.ts` og
 * `lib/games/flightDelivery.test.ts`.
 */

const GAME_ID = 'spill-1';
const PLAYER = 'spilleren';
const STRANGER = 'en-fremmed';
// Makkerne i flighten (#2200). Uuid-er, fordi ruta avviser alt annet i `alsoFor`.
const OLA = '00000000-0000-4000-a000-000000000002';
const GUEST = '00000000-0000-4000-a000-000000000003';
const PER = '00000000-0000-4000-a000-000000000004';
const OUTSIDER = '00000000-0000-4000-a000-000000000009';

const PLAYER_TOKEN = 'token-spiller';
const STRANGER_TOKEN = 'token-fremmed';

type Membership = {
  withdrawn_at: string | null;
  submitted_at: string | null;
  team_number: number | null;
};

let db: {
  /** `false` = spillet finnes ikke. */
  gameExists: boolean;
  status: string;
  gameMode: string;
  /** Innsenderens egen rad, eller `null` når hen ikke er med i spillet. */
  me: Membership | null;
  /** Radene UPDATE-en traff — `.select('user_id')`-svaret. */
  updated: { user_id: string }[];
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
              name: 'Cup-dagen',
              status: db.status,
              require_peer_approval: false,
              game_mode: db.gameMode,
              // `full` holder søsken-kaskaden (#1466) utenfor: den nås aldri fra
              // appen, som stenger segment-avledede spill i formatGate.
              hole_segment: 'full',
              tournament_id: null,
              source_game_id: null,
            }
          : null,
    };
  }
  if (op.table === 'game_players' && op.kind === 'update') {
    // #2200: flight-leveringen er ÉN skriving med `in('user_id', …)`. Alle de
    // spurte radene står fortsatt åpne, så svaret er de samme id-ene.
    const ids = op.filters.find((f) => f.op === 'in' && f.column === 'user_id')?.value;
    if (Array.isArray(ids)) return { data: ids.map((user_id) => ({ user_id })) };
    return { data: db.updated };
  }
  if (op.table === 'game_players' && op.columns?.includes('users!')) {
    // Flighten (#2200): spilleren fører for Ola og gjesten; Per fører selv.
    return {
      data: [rosterRow(PLAYER), rosterRow(OLA), rosterRow(GUEST, true), rosterRow(PER)],
    };
  }
  if (op.table === 'scores') {
    return {
      data:
        op.range?.[0] === 0
          ? [...card(OLA, PLAYER), ...card(GUEST, PLAYER), ...card(PER, PER)]
          : [],
    };
  }
  if (op.table === 'game_players') {
    return { data: value('user_id') === PLAYER ? db.me : null };
  }
  // Innsenderens navn, så admin-lista (tom → ingen varsler her).
  if (op.table === 'users' && op.columns === 'name') {
    return { data: { name: 'Anders Berg' } };
  }
  if (op.table === 'users') return { data: [] };
  throw new Error(`uventet spørring: ${op.kind} ${op.table}`);
}

/** Et kort med alle 18 hull ført av `enteredBy`. */
function card(userId: string, enteredBy: string) {
  return Array.from({ length: 18 }, (_, i) => ({
    user_id: userId,
    hole_number: i + 1,
    strokes: 4,
    entered_by: enteredBy,
  }));
}

function rosterRow(user_id: string, is_guest = false) {
  return {
    user_id,
    team_number: null,
    flight_number: null,
    withdrawn_at: null,
    submitted_at: null,
    users: { name: user_id, is_guest },
  };
}

const fake = createAdminClientMock({
  tokens: { [PLAYER_TOKEN]: PLAYER, [STRANGER_TOKEN]: STRANGER },
  respond: (op) => respond(op),
});

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => fake.client,
}));
// revalidateTag/revalidatePath kaster utenfor Next-runtime.
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock('@/lib/notifications/notify', () => ({
  notify: vi.fn(async () => ({ shouldAlsoSendMail: false })),
}));
vi.mock('@/lib/mail/scorecardSubmittedNotification', () => ({
  sendScorecardSubmittedNotification: vi.fn(),
}));

import { NextRequest } from 'next/server';
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
    `http://localhost/api/games/${GAME_ID}/submit-team${query}`,
    {
      method: 'POST',
      headers,
      ...(body === undefined
        ? {}
        : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    },
  );
}

/** Rute-konteksten Next gir handleren — `params` er en Promise i Next 16. */
const ctx = () => ({ params: Promise.resolve({ id: GAME_ID }) });

/** Hver skriving som faktisk ble sendt. Tom = ingenting ble markert. */
const updates = () => fake.ops.filter((op) => op.kind === 'update');

/**
 * Hver spill-id noen spørring filtrerte på. `id` teller kun på `games` —
 * bruker-oppslaget filtrerer også på `id`, men det er en bruker-id.
 */
const gameIdsTouched = () =>
  fake.ops.flatMap((op) =>
    op.filters
      .filter(
        (f) => f.column === 'game_id' || (op.table === 'games' && f.column === 'id'),
      )
      .map((f) => f.value),
  );

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  db = {
    gameExists: true,
    status: 'active',
    gameMode: 'greensome_matchplay',
    me: { withdrawn_at: null, submitted_at: null, team_number: 1 },
    updated: [{ user_id: PLAYER }, { user_id: 'lagkameraten' }],
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
    // Tokenet ble faktisk sendt til validering — koblingen er bevist.
    expect(fake.getUserCalls).toEqual(['utgatt-token']);
    expect(fake.ops).toEqual([]);
  });

  it('fra en innlogget bruker som ikke er med i spillet: 403, ingen skriving', async () => {
    const res = await POST(request({ token: `Bearer ${STRANGER_TOKEN}` }), ctx());

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'forbidden' });
    // Hele autorisasjonen ligger i at kjernen ikke finner en rad å skrive til.
    expect(updates()).toEqual([]);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('mot et ukjent spill: 404 — også for en innlogget bruker', async () => {
    db.gameExists = false;

    const res = await POST(request({ token: `Bearer ${PLAYER_TOKEN}` }), ctx());

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'not_found' });
    expect(updates()).toEqual([]);
  });

  it('mot en runde som ikke er i gang: 409 not_active', async () => {
    db.status = 'finished';

    const res = await POST(request({ token: `Bearer ${PLAYER_TOKEN}` }), ctx());

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: 'not_active' });
    expect(updates()).toEqual([]);
  });

  it('fra en trukket spiller: 422 withdrawn — egen status, ikke en andre 409', async () => {
    db.me = {
      withdrawn_at: '2026-09-03T10:00:00+00:00',
      submitted_at: null,
      team_number: 1,
    };

    const res = await POST(request({ token: `Bearer ${PLAYER_TOKEN}` }), ctx());

    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toEqual({ error: 'withdrawn' });
    expect(updates()).toEqual([]);
  });
});

describe('POST — leveringen', () => {
  it('markerer hele lagets aktive, uleverte rader', async () => {
    const res = await POST(request({ token: `Bearer ${PLAYER_TOKEN}` }), ctx());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      submitted: 2,
      alreadySubmitted: false,
      alsoDelivered: 0,
    });

    const [mark, ...extra] = updates();
    expect(extra).toEqual([]);
    expect(mark.table).toBe('game_players');
    expect(mark.columns).toBe('user_id');
    // #2200: who delivered rides along, so teammates show «Levert av» the captain.
    expect(Object.keys(mark.payload ?? {})).toEqual([
      'submitted_at',
      'rejection_reason',
      'submitted_by_user_id',
    ]);
    expect(mark.filters).toEqual([
      { op: 'eq', column: 'game_id', value: GAME_ID },
      { op: 'eq', column: 'team_number', value: 1 },
      { op: 'is', column: 'withdrawn_at', value: null },
      { op: 'is', column: 'submitted_at', value: null },
    ]);
  });

  it('solo (#2215): en spiller uten lag markerer bare sin egen rad', async () => {
    // Appen leverer alle kort her siden #2215, ikke bare lagkortet.
    db.gameMode = 'solo_strokeplay';
    db.me = { withdrawn_at: null, submitted_at: null, team_number: null };
    db.updated = [{ user_id: PLAYER }];

    const res = await POST(request({ token: `Bearer ${PLAYER_TOKEN}` }), ctx());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      submitted: 1,
      alreadySubmitted: false,
      alsoDelivered: 0,
    });

    const [mark, ...extra] = updates();
    expect(extra).toEqual([]);
    expect(mark.table).toBe('game_players');
    // Ingen lag-kaskade: filteret er innsenderens egen rad, ikke et lagnummer.
    expect(mark.filters).toEqual([
      { op: 'eq', column: 'game_id', value: GAME_ID },
      { op: 'eq', column: 'user_id', value: PLAYER },
      { op: 'is', column: 'submitted_at', value: null },
    ]);
  });

  it('kortet står alt som levert: 200 med alreadySubmitted, ingen skriving', async () => {
    db.me = {
      withdrawn_at: null,
      submitted_at: '2026-09-03T12:00:00+00:00',
      team_number: 1,
    };

    const res = await POST(request({ token: `Bearer ${PLAYER_TOKEN}` }), ctx());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      submitted: 0,
      alreadySubmitted: true,
      alsoDelivered: 0,
    });
    expect(updates()).toEqual([]);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('en spill- eller bruker-id i kropp og query ignoreres — stien og tokenet er kildene', async () => {
    const res = await POST(
      request({
        token: `Bearer ${PLAYER_TOKEN}`,
        query: '?id=et-annet-spill&gameId=et-annet-spill',
        body: { gameId: 'et-annet-spill', userId: STRANGER },
      }),
      ctx(),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      submitted: 2,
      alreadySubmitted: false,
      alsoDelivered: 0,
    });
    // Hvert eneste spill-oppslag gjaldt id-en fra stien.
    expect(gameIdsTouched().length).toBeGreaterThan(0);
    expect(new Set(gameIdsTouched())).toEqual(new Set([GAME_ID]));
    // Og medlemskapet som ble slått opp var tokenets, ikke kroppens.
    const userIds = fake.ops
      .flatMap((op) => op.filters)
      .filter((f) => f.column === 'user_id')
      .map((f) => f.value);
    expect(userIds).not.toContain(STRANGER);
  });
});

describe('POST — makkerne i samme levering (#2200)', () => {
  const asPlayer = (body: unknown) => request({ token: `Bearer ${PLAYER_TOKEN}`, body });

  beforeEach(() => {
    db.gameMode = 'stableford';
    db.me = { withdrawn_at: null, submitted_at: null, team_number: null };
    db.updated = [{ user_id: PLAYER }];
  });

  it.each([
    ['ikke JSON', 'lever alt'],
    ['alsoFor er ikke en liste', { alsoFor: OLA }],
    ['en id er ikke en uuid', { alsoFor: ['ola'] }],
    ['mer enn 20 id-er', { alsoFor: Array.from({ length: 21 }, () => OLA) }],
  ])('feilformet kropp (%s): 400, ingenting leses eller skrives', async (_, body) => {
    const res = await POST(asPlayer(body), ctx());

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'bad_request' });
    expect(fake.ops).toEqual([]);
  });

  it('en feilformet kropp uten token er fortsatt 401 — tokenet sjekkes først', async () => {
    const res = await POST(request({ body: 'lever alt' }), ctx());

    expect(res.status).toBe(401);
    expect(fake.ops).toEqual([]);
  });

  it('eget kort, makkeren jeg førte og gjesten i én skriving, levert av meg', async () => {
    const res = await POST(asPlayer({ alsoFor: [OLA, GUEST] }), ctx());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      submitted: 3,
      alreadySubmitted: false,
      alsoDelivered: 2,
    });
    const [mark, ...extra] = updates();
    expect(extra).toEqual([]);
    expect(mark.payload).toMatchObject({ submitted_by_user_id: PLAYER });
    expect(mark.filters).toContainEqual({
      op: 'in',
      column: 'user_id',
      value: [PLAYER, OLA, GUEST],
    });
  });

  it('forfalskede id-er (fører selv, utenfor spillet) ignoreres og utvider aldri settet', async () => {
    const res = await POST(asPlayer({ alsoFor: [OLA, PER, OUTSIDER] }), ctx());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      submitted: 2,
      alreadySubmitted: false,
      alsoDelivered: 1,
    });
    const [mark, ...extra] = updates();
    expect(extra).toEqual([]);
    expect(mark.filters).toContainEqual({ op: 'in', column: 'user_id', value: [PLAYER, OLA] });
  });

  it('tom alsoFor: vanlig egen levering, og regelen spørres ikke', async () => {
    const res = await POST(asPlayer({ alsoFor: [] }), ctx());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      submitted: 1,
      alreadySubmitted: false,
      alsoDelivered: 0,
    });
    expect(fake.ops.some((op) => op.table === 'scores')).toBe(false);
  });
});

describe('feil under panseret', () => {
  it('kjernen kaster → 500 med en ugjennomsiktig kode', async () => {
    db.coreThrows = true;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(request({ token: `Bearer ${PLAYER_TOKEN}` }), ctx());

    expect(res.status).toBe(500);
    // Aldri `err.message` på tråden — endepunktet er offentlig eksponert.
    await expect(res.json()).resolves.toEqual({ error: 'submit_failed' });
    expect(errorSpy).toHaveBeenCalledWith(
      '[api/games/[id]/submit-team] submit threw',
      expect.any(Error),
    );
    expect(updates()).toEqual([]);
  });
});
