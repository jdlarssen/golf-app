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
 * Hverken porten (`scorecardReviewAccess` i `lib/api/appAuth.ts`) eller
 * kjernene (`lib/games/reviewScorecardCore.ts`) er stubbet her — bare Supabase
 * og varslene er det. Grunnen: kjernen skriver med service-role, så porten er
 * den eneste tilgangssjekken, og det som må bevises er at lagene henger sammen
 * i praksis — at et avvist token aldri når kjernen, at en som ikke får lov ikke
 * får skrevet en eneste rad, og at hvert valg faktisk varsler.
 *
 * Det fila bevisst IKKE re-asserterer: hele rolle-tabellen (bor i
 * `lib/api/appAuth.test.ts`) og 0-rads-oppløsningen og lagkort-kaskaden (bor i
 * `lib/games/reviewScorecardCore.test.ts`).
 */

const GAME_ID = 'spill-1';
const CREATOR = 'oppretteren';
const PEER = 'flightkamerat';
const OWNER = 'kortets-eier';
const FAR = 'annen-flight';
const ADMIN = 'klubb-admin';
const STRANGER = 'en-fremmed';
// #2200: et kort flightkameraten (PEER) leverte for eieren.
const CARRIED = 'kort-levert-av-kamerat';

const TOKENS: Record<string, string> = {
  'token-oppretter': CREATOR,
  'token-kamerat': PEER,
  'token-admin': ADMIN,
  'token-fremmed': STRANGER,
};
const bearer = (userId: string) =>
  `Bearer ${Object.keys(TOKENS).find((t) => TOKENS[t] === userId)}`;

const NAMES: Record<string, string> = {
  [CREATOR]: 'Kari Arrangør',
  [PEER]: 'Ola Kompis',
  [ADMIN]: 'Anne Admin',
};

let db: {
  gameExists: boolean;
  status: string;
  /** Radene UPDATE-en traff — `.select('user_id')`-svaret. */
  updated: { user_id: string }[];
  /** Oppfølgings-lesingen etter 0 rader. */
  existing: Record<string, unknown> | null;
  /** Settes for å bevise at et kast blir 500, ikke en halv 200. */
  throws: boolean;
};

function respond(op: QueryOp): QueryResponse {
  const value = (column: string) =>
    op.filters.find((f) => f.column === column)?.value as string | undefined;

  if (db.throws) throw new Error('connection reset');

  if (op.table === 'games') {
    return {
      data:
        db.gameExists && value('id') === GAME_ID
          ? {
              name: 'Sommercup',
              status: db.status,
              game_mode: 'stableford',
              created_by: CREATOR,
            }
          : null,
    };
  }
  if (op.table === 'game_players' && op.kind === 'update') {
    return { data: db.updated };
  }
  if (op.table === 'game_players' && op.columns?.startsWith('user_id, flight_number, withdrawn_at')) {
    // Sju aktive i to flighter: attestant-regelen går på flight.
    return {
      data: [
        { user_id: CREATOR, flight_number: 1, withdrawn_at: null },
        { user_id: PEER, flight_number: 1, withdrawn_at: null },
        { user_id: OWNER, flight_number: 1, withdrawn_at: null },
        { user_id: CARRIED, flight_number: 1, withdrawn_at: null, submitted_by_user_id: PEER },
        { user_id: FAR, flight_number: 2, withdrawn_at: null },
        { user_id: 'f2-b', flight_number: 2, withdrawn_at: null },
        { user_id: 'f2-c', flight_number: 2, withdrawn_at: null },
      ],
    };
  }
  if (op.table === 'game_players') return { data: db.existing };
  if (op.table === 'users' && op.columns === 'is_admin') {
    return { data: { is_admin: value('id') === ADMIN } };
  }
  if (op.table === 'users' && op.columns === 'name') {
    return { data: { name: NAMES[value('id') ?? ''] ?? null } };
  }
  throw new Error(`uventet spørring: ${op.kind} ${op.table}`);
}

const fake = createAdminClientMock({ tokens: TOKENS, respond: (op) => respond(op) });

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => fake.client,
}));
// revalidateTag/revalidatePath kaster utenfor Next-runtime.
const revalidateTagMock = vi.fn();
vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
  revalidatePath: vi.fn(),
}));
vi.mock('@/lib/notifications/notify', () => ({
  notify: vi.fn(async () => ({ shouldAlsoSendMail: false })),
}));

import { NextRequest } from 'next/server';
import { notify } from '@/lib/notifications/notify';
import { POST } from './route';

const notifyMock = vi.mocked(notify);

function request({
  token,
  query = '',
  body,
  rawBody,
}: { token?: string; query?: string; body?: unknown; rawBody?: string } = {}) {
  const headers: Record<string, string> = {};
  if (token !== undefined) headers.authorization = token;
  const payload = rawBody ?? (body === undefined ? undefined : JSON.stringify(body));
  return new NextRequest(
    `http://localhost/api/games/${GAME_ID}/scorecards/${OWNER}${query}`,
    { method: 'POST', headers, ...(payload === undefined ? {} : { body: payload }) },
  );
}

/** Rute-konteksten Next gir handleren — `params` er en Promise i Next 16. */
const ctx = (playerUserId = OWNER) => ({
  params: Promise.resolve({ id: GAME_ID, userId: playerUserId }),
});

/** Hver skriving som faktisk ble sendt. Tom = ingenting ble rørt. */
const updates = () => fake.ops.filter((op) => op.kind === 'update');

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  db = {
    gameExists: true,
    status: 'active',
    updated: [{ user_id: OWNER }],
    existing: null,
    throws: false,
  };
});

describe('porten', () => {
  it('uten Authorization-header: 401 før noe leses', async () => {
    const res = await POST(request({ body: { decision: 'approve' } }), ctx());

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
    expect(fake.getUserCalls).toEqual([]);
    expect(fake.ops).toEqual([]);
  });

  it('med et token GoTrue avviser: 401, ingenting kjøres', async () => {
    const res = await POST(
      request({ token: 'Bearer utgatt-token', body: { decision: 'approve' } }),
      ctx(),
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
    expect(fake.getUserCalls).toEqual(['utgatt-token']);
    expect(fake.ops).toEqual([]);
  });

  it.each(['approve', 'reject', 'reopen'])(
    'en innlogget fremmed (%s): 403, ingen rad skrives og ingen varsles',
    async (decision) => {
      const res = await POST(
        request({ token: bearer(STRANGER), body: { decision } }),
        ctx(),
      );

      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({ error: 'forbidden' });
      expect(updates()).toEqual([]);
      expect(notifyMock).not.toHaveBeenCalled();
    },
  );

  it('oppretteren utenfor flighten avviser: 403, ingen rad endret', async () => {
    const res = await POST(
      request({ token: bearer(CREATOR), body: { decision: 'reject', reason: 'Feil' } }),
      ctx(FAR),
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'forbidden' });
    expect(updates()).toEqual([]);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  // #2200: ruta skriver med service-role, så vakta i 0191 kjører ikke. Porten
  // og skrivingen må selv gi vaktas svar.
  it.each([
    { navn: 'kortet hen leverte for en makker', player: CARRIED },
    { navn: 'sitt eget kort', player: PEER },
  ])('en flightkamerat godkjenner $navn: 403, ingen rad skrives', async ({ player }) => {
    const res = await POST(
      request({ token: bearer(PEER), body: { decision: 'approve' } }),
      ctx(player),
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'forbidden' });
    expect(updates()).toEqual([]);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it.each([ADMIN, PEER])('mot et ukjent spill: 404 — også for %s', async (caller) => {
    db.gameExists = false;

    const res = await POST(
      request({ token: bearer(caller), body: { decision: 'approve' } }),
      ctx(),
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'not_found' });
    expect(updates()).toEqual([]);
  });

  it('mot en runde som ikke er i gang: 409 not_active', async () => {
    db.status = 'finished';

    const res = await POST(
      request({ token: bearer(PEER), body: { decision: 'approve' } }),
      ctx(),
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: 'not_active' });
    expect(updates()).toEqual([]);
  });

  it.each([
    { navn: 'ukjent decision', rawBody: JSON.stringify({ decision: 'delete' }) },
    { navn: 'manglende decision', rawBody: JSON.stringify({ reason: 'Feil' }) },
    { navn: 'reason som ikke er tekst', rawBody: JSON.stringify({ decision: 'reject', reason: 42 }) },
    { navn: 'ugyldig JSON', rawBody: '{decision:' },
    { navn: 'ingen kropp', rawBody: undefined },
  ])('$navn: 400 bad_request, ingenting leses', async ({ rawBody }) => {
    const res = await POST(request({ token: bearer(PEER), rawBody }), ctx());

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'bad_request' });
    expect(fake.ops).toEqual([]);
  });
});

describe('POST — valgene', () => {
  it.each([
    { navn: 'en flightkamerat', caller: PEER, player: OWNER, role: 'peer' },
    { navn: 'en admin utenfor rosteret', caller: ADMIN, player: OWNER, role: 'organizer' },
    { navn: 'oppretteren utenfor flighten', caller: CREATOR, player: FAR, role: 'organizer' },
  ])('approve fra $navn: 200, scorecard_approved med rollen $role', async ({ caller, player, role }) => {
    db.updated = [{ user_id: player }];

    const res = await POST(
      request({ token: bearer(caller), body: { decision: 'approve' } }),
      ctx(player),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ alreadyDone: false });
    const [write, ...extra] = updates();
    expect(extra).toEqual([]);
    expect(write.payload).toMatchObject({ approved_by_user_id: caller });
    expect(write.filters).toContainEqual({ op: 'eq', column: 'user_id', value: player });
    // Bare et levert kort, uansett rolle (#2200: vakta kjører ikke her).
    expect(write.filters).toContainEqual({ op: 'not', column: 'submitted_at', value: null });
    // Den som leverte, godkjenner ikke: i skrivingen for en medspiller. Arrangør
    // og admin er unntatt, som i vakta.
    const delivererFilter = {
      op: 'or',
      column: '',
      value: `submitted_by_user_id.is.null,submitted_by_user_id.neq.${caller}`,
    };
    if (role === 'peer') expect(write.filters).toContainEqual(delivererFilter);
    else expect(write.filters).not.toContainEqual(delivererFilter);
    expect(notifyMock.mock.calls).toEqual([
      [
        {
          userId: player,
          kind: 'scorecard_approved',
          payload: {
            game_id: GAME_ID,
            game_name: 'Sommercup',
            approver_name: NAMES[caller],
            approver_role: role,
          },
        },
      ],
    ]);
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, { expire: 0 });
  });

  it('reject med grunn: 200, raden bærer grunnen og spilleren varsles', async () => {
    const res = await POST(
      request({ token: bearer(PEER), body: { decision: 'reject', reason: '  Feil sum  ' } }),
      ctx(),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ alreadyDone: false });
    expect(updates()[0].payload).toEqual({
      submitted_at: null,
      approved_at: null,
      approved_by_user_id: null,
      rejection_reason: 'Feil sum',
    });
    expect(notifyMock.mock.calls).toEqual([
      [
        {
          userId: OWNER,
          kind: 'scorecard_rejected',
          payload: {
            game_id: GAME_ID,
            game_name: 'Sommercup',
            rejecter_name: 'Ola Kompis',
            reason: 'Feil sum',
          },
        },
      ],
    ]);
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, { expire: 0 });
  });

  it('reopen fra oppretteren: 200, kortet nulles og scorecard_reopened går ut', async () => {
    db.updated = [{ user_id: FAR }];

    const res = await POST(
      request({ token: bearer(CREATOR), body: { decision: 'reopen' } }),
      ctx(FAR),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ alreadyDone: false });
    expect(updates()[0].payload).toEqual({
      submitted_at: null,
      approved_at: null,
      approved_by_user_id: null,
      rejection_reason: null,
    });
    expect(notifyMock.mock.calls).toEqual([
      [
        {
          userId: FAR,
          kind: 'scorecard_reopened',
          payload: { game_id: GAME_ID, game_name: 'Sommercup', actor_name: 'Kari Arrangør' },
        },
      ],
    ]);
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, { expire: 0 });
  });

  it('kortet er alt godkjent: 200 med alreadyDone, ingen nytt varsel', async () => {
    db.updated = [];
    db.existing = { approved_at: '2026-09-27T10:00:00Z' };

    const res = await POST(
      request({ token: bearer(PEER), body: { decision: 'approve' } }),
      ctx(),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ alreadyDone: true });
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('kortet er ikke levert: 422 not_pending, ingen varsel', async () => {
    db.updated = [];
    db.existing = { approved_at: null };

    const res = await POST(
      request({ token: bearer(PEER), body: { decision: 'approve' } }),
      ctx(),
    );

    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toEqual({ error: 'not_pending' });
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('en spill- eller bruker-id i kropp og query ignoreres — stien og tokenet er kildene', async () => {
    const res = await POST(
      request({
        token: bearer(PEER),
        query: '?id=et-annet-spill&userId=en-annen',
        body: {
          decision: 'approve',
          gameId: 'et-annet-spill',
          userId: STRANGER,
          playerUserId: 'en-annen',
          approverRole: 'organizer',
        },
      }),
      ctx(),
    );

    expect(res.status).toBe(200);
    // Hvert spill-oppslag gjaldt id-en fra stien.
    const gameIds = fake.ops.flatMap((op) =>
      op.filters
        .filter((f) => f.column === 'game_id' || (op.table === 'games' && f.column === 'id'))
        .map((f) => f.value),
    );
    expect(gameIds.length).toBeGreaterThan(0);
    expect(new Set(gameIds)).toEqual(new Set([GAME_ID]));
    // Kortet som ble skrevet var stiens, godkjenneren tokenets, og rollen portens.
    const [write] = updates();
    expect(write.filters).toContainEqual({ op: 'eq', column: 'user_id', value: OWNER });
    expect(write.payload).toMatchObject({ approved_by_user_id: PEER });
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: OWNER,
        payload: expect.objectContaining({ approver_role: 'peer' }),
      }),
    );
  });
});

describe('feil under panseret', () => {
  it('et kast blir 500 med en ugjennomsiktig kode', async () => {
    db.throws = true;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(
      request({ token: bearer(PEER), body: { decision: 'approve' } }),
      ctx(),
    );

    expect(res.status).toBe(500);
    // Aldri `err.message` på tråden — endepunktet er offentlig eksponert.
    await expect(res.json()).resolves.toEqual({ error: 'review_failed' });
    expect(errorSpy).toHaveBeenCalledWith(
      '[api/games/[id]/scorecards/[userId]] review threw',
      expect.any(Error),
    );
    expect(updates()).toEqual([]);
    errorSpy.mockRestore();
  });
});
