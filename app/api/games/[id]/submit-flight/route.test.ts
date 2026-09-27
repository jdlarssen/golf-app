// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAdminClientMock,
  type QueryOp,
  type QueryResponse,
} from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2200): rutas port og transport, i samme form som submit-team.
 *
 * Hverken adgangssjekken, leverings-kjernen eller leveringsregelen er stubbet
 * her — bare Supabase, varslene og mailen er det. Det som må bevises, er at
 * lagene henger sammen: et avvist token når aldri kjernen, en feilformet kropp
 * gir 400 før noe skrives, og en forfalsket id i `alsoFor` utvider aldri
 * settet som leveres.
 *
 * Det fila bevisst IKKE re-asserterer: selve regelen (flightDelivery.test.ts)
 * og kjernens kappløp, drift og varsel-mottakere (submitScorecardCore.test.ts).
 */

const GAME_ID = 'spill-1';
const PLAYER = '00000000-0000-4000-a000-000000000001';
const OLA = '00000000-0000-4000-a000-000000000002';
const GUEST = '00000000-0000-4000-a000-000000000003';
const PER = '00000000-0000-4000-a000-000000000004';
const STRANGER = '00000000-0000-4000-a000-000000000009';

const PLAYER_TOKEN = 'token-spiller';
const STRANGER_TOKEN = 'token-fremmed';

type Membership = { withdrawn_at: string | null; submitted_at: string | null; team_number: null };

let db: {
  gameExists: boolean;
  status: string;
  me: Membership | null;
  coreThrows: boolean;
};

/** A card with all 18 holes entered by `enteredBy`. */
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

function respond(op: QueryOp): QueryResponse {
  const value = (column: string) => op.filters.find((f) => f.column === column)?.value;

  if (op.table === 'games') {
    if (db.coreThrows) throw new Error('connection reset');
    return {
      data:
        db.gameExists && value('id') === GAME_ID
          ? {
              name: 'Klubbkvelden',
              status: db.status,
              require_peer_approval: false,
              game_mode: 'stableford',
              hole_segment: 'full',
              tournament_id: null,
              source_game_id: null,
            }
          : null,
    };
  }
  if (op.table === 'game_players' && op.kind === 'update') {
    // The one flight update: echo back every requested id (all still open).
    const ids = op.filters.find((f) => f.column === 'user_id')?.value;
    return { data: (Array.isArray(ids) ? ids : [ids]).map((user_id) => ({ user_id })) };
  }
  if (op.table === 'game_players' && op.columns?.includes('users!')) {
    // Kari (PLAYER) keeps score for Ola and the guest; Per keeps his own.
    return {
      data: [rosterRow(PLAYER), rosterRow(OLA), rosterRow(GUEST, true), rosterRow(PER)],
    };
  }
  if (op.table === 'game_players') {
    return { data: value('user_id') === PLAYER ? db.me : null };
  }
  if (op.table === 'scores') {
    return {
      data:
        op.range?.[0] === 0
          ? [...card(OLA, PLAYER), ...card(GUEST, PER), ...card(PER, PER)]
          : [],
    };
  }
  if (op.table === 'users' && op.columns === 'name') {
    return { data: { name: 'Kari Fører' } };
  }
  if (op.table === 'users') return { data: [] };
  throw new Error(`uventet spørring: ${op.kind} ${op.table}`);
}

const fake = createAdminClientMock({
  tokens: { [PLAYER_TOKEN]: PLAYER, [STRANGER_TOKEN]: STRANGER },
  respond: (op) => respond(op),
});

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => fake.client,
}));
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
import { POST } from './route';

function request({ token, body }: { token?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = {};
  if (token !== undefined) headers.authorization = token;
  return new NextRequest(`http://localhost/api/games/${GAME_ID}/submit-flight`, {
    method: 'POST',
    headers,
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
}

const ctx = () => ({ params: Promise.resolve({ id: GAME_ID }) });
const updates = () => fake.ops.filter((op) => op.kind === 'update');
const asPlayer = (body: unknown) => request({ token: `Bearer ${PLAYER_TOKEN}`, body });

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  db = {
    gameExists: true,
    status: 'active',
    me: { withdrawn_at: null, submitted_at: null, team_number: null },
    coreThrows: false,
  };
});

describe('porten', () => {
  it('uten Authorization-header: 401 før noe leses', async () => {
    const res = await POST(request({ body: { alsoFor: [OLA] } }), ctx());

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
    expect(fake.ops).toEqual([]);
  });

  it.each([
    ['ingen kropp', undefined],
    ['ikke JSON', 'lever alt'],
    ['alsoFor mangler', {}],
    ['alsoFor er ikke en liste', { alsoFor: OLA }],
    ['en id er ikke en uuid', { alsoFor: ['ola'] }],
    ['mer enn 20 id-er', { alsoFor: Array.from({ length: 21 }, () => OLA) }],
  ])('feilformet kropp (%s): 400, ingenting leses eller skrives', async (_, body) => {
    const res = await POST(asPlayer(body), ctx());

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'bad_request' });
    expect(fake.ops).toEqual([]);
  });

  it('fra en innlogget bruker som ikke er med i spillet: 403, ingen skriving', async () => {
    const res = await POST(
      request({ token: `Bearer ${STRANGER_TOKEN}`, body: { alsoFor: [OLA] } }),
      ctx(),
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'forbidden' });
    expect(updates()).toEqual([]);
  });

  it('mot et ukjent spill: 404', async () => {
    db.gameExists = false;

    const res = await POST(asPlayer({ alsoFor: [OLA] }), ctx());

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'not_found' });
    expect(updates()).toEqual([]);
  });

  it('mot en runde som ikke er i gang: 409 not_active', async () => {
    db.status = 'finished';

    const res = await POST(asPlayer({ alsoFor: [OLA] }), ctx());

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: 'not_active' });
    expect(updates()).toEqual([]);
  });

  it('fra en trukket spiller: 422 withdrawn', async () => {
    db.me = { withdrawn_at: '2026-09-27T10:00:00+00:00', submitted_at: null, team_number: null };

    const res = await POST(asPlayer({ alsoFor: [OLA] }), ctx());

    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toEqual({ error: 'withdrawn' });
    expect(updates()).toEqual([]);
  });
});

describe('POST — leveringen', () => {
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
    expect(mark.filters).toContainEqual({ op: 'in', column: 'user_id', value: [PLAYER, OLA, GUEST] });
  });

  it('forfalskede id-er (fører selv, utenfor spillet) ignoreres og utvider aldri settet', async () => {
    const res = await POST(asPlayer({ alsoFor: [OLA, PER, STRANGER] }), ctx());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      submitted: 2,
      alreadySubmitted: false,
      alsoDelivered: 1,
    });
    expect(updates()[0].filters).toContainEqual({
      op: 'in',
      column: 'user_id',
      value: [PLAYER, OLA],
    });
  });

  it('tom alsoFor: vanlig egen levering', async () => {
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

    const res = await POST(asPlayer({ alsoFor: [OLA] }), ctx());

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'submit_failed' });
    expect(errorSpy).toHaveBeenCalledWith(
      '[api/games/[id]/submit-flight] submit threw',
      expect.any(Error),
    );
    expect(updates()).toEqual([]);
    errorSpy.mockRestore();
  });
});
