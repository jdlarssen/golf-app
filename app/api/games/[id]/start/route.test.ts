// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAdminClientMock,
  type QueryOp,
  type QueryResponse,
} from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2215): rutas port og transport, og etterarbeidet ved start.
 *
 * Ingenting av start-kjeden er stubbet: adgangssjekken (`lib/api/appAuth.ts`),
 * web-innpakningen (`startScheduledGame`, som sender `registration_expired`),
 * kjernen (`startScheduledGameCore`) og `announceStartedGame` (avledede spill +
 * `game_started`) kjører ekte mot en database-dobbel som faktisk flipper status.
 * Bare Supabase og `notify` er doblet. Det er med vilje: ingen test av webbens
 * `startScheduledGameAction` dekker flyttingen av etterarbeidet, så beviset for
 * `announceStartedGame` står her.
 *
 * Dobbelen har ingen `rpc`, og kjernens profil-sjekk er RPC-en
 * `incomplete_profile_ids` (#2207). Den legges på ved siden av, uten å endre
 * den delte dobbelen.
 *
 * Kjernens egne vakter (lag, flighter, sider, greensome) har sin suite i
 * `lib/games/startScheduledGame.test.ts`; her står én representant per status.
 */

const GAME_ID = '22222222-2222-2222-2222-222222222222';
const DERIVED_ID = '33333333-3333-3333-3333-333333333333';
const ORGANISER = '11111111-1111-1111-1111-111111111111';
const OLA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PER = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const WITHDRAWN = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const APPLICANT = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const STRANGER = '99999999-9999-9999-9999-999999999999';
const CLUB_ADMIN = '77777777-7777-7777-7777-777777777777';
const OTHER_GAME = '88888888-8888-8888-8888-888888888888';

const ORGANISER_TOKEN = 'token-arrangor';
const STRANGER_TOKEN = 'token-fremmed';
const ADMIN_TOKEN = 'token-admin';

const TEE = {
  slope_mens: 113,
  course_rating_mens: 72,
  par_total_mens: 72,
  slope_ladies: 113,
  course_rating_ladies: 72,
  par_total_ladies: 72,
  slope_juniors: 113,
  course_rating_juniors: 72,
  par_total_juniors: 72,
};

type Game = {
  id: string;
  name: string;
  status: string;
  created_by: string;
  source_game_id: string | null;
  game_mode: string;
  tee_box_id: string | null;
};
type Player = { user_id: string; withdrawn_at: string | null };
type Signup = { id: string; user_id: string; status: string; team_request_id: string | null };

let db: {
  games: Record<string, Game>;
  players: Record<string, Player[]>;
  admins: Record<string, boolean>;
  /** Svaret fra `incomplete_profile_ids`. */
  pendingProfiles: string[];
  signups: Record<string, Signup[]>;
  /** Settes for å bevise at et kast blir 500, ikke en halv 200. */
  coreThrows: boolean;
};

function game(overrides: Partial<Game> & { id: string }): Game {
  return {
    name: 'Tirsdagsrunden',
    status: 'scheduled',
    created_by: ORGANISER,
    source_game_id: null,
    game_mode: 'solo_strokeplay',
    tee_box_id: 'tee-1',
    ...overrides,
  };
}

function respond(op: QueryOp): QueryResponse {
  const value = (column: string) =>
    op.filters.find((f) => f.column === column)?.value;

  if (op.table === 'games') {
    if (db.coreThrows && op.columns !== 'created_by') {
      throw new Error('connection reset');
    }
    if (op.kind === 'update') {
      const row = db.games[String(value('id'))];
      if (op.payload?.status === 'active') {
        // Optimistisk lås: bare en rad som fortsatt står `scheduled` flippes.
        if (!row || row.status !== value('status')) return { data: [] };
        row.status = 'active';
      }
      return { data: row ? [{ id: row.id }] : [] };
    }
    const source = value('source_game_id');
    if (source !== undefined) {
      return {
        data: Object.values(db.games)
          .filter((g) => g.source_game_id === source)
          .map((g) => ({ id: g.id })),
      };
    }
    const row = db.games[String(value('id'))];
    return {
      data: row
        ? {
            ...row,
            hcp_allowance_pct: 100,
            mode_config: null,
            tournament_id: null,
            scheduled_tee_off_at: null,
            tee_boxes: row.tee_box_id ? TEE : null,
          }
        : null,
    };
  }

  if (op.table === 'game_players') {
    const rows = db.players[String(value('game_id'))] ?? [];
    if (op.kind === 'update') {
      const hit = rows.some((r) => r.user_id === value('user_id'));
      return { data: hit ? [{ user_id: value('user_id') }] : [] };
    }
    const activeOnly = op.filters.some(
      (f) => f.op === 'is' && f.column === 'withdrawn_at' && f.value === null,
    );
    return {
      data: rows
        .filter((r) => !activeOnly || r.withdrawn_at === null)
        .map((r) => ({
          user_id: r.user_id,
          tee_gender: 'mens',
          team_number: null,
          flight_number: null,
          withdrawn_at: r.withdrawn_at,
          users: { hcp_index: 10 },
        })),
    };
  }

  if (op.table === 'game_registration_requests') {
    const rows = db.signups[String(value('game_id'))] ?? [];
    if (op.kind === 'update') {
      const ids = value('id') as string[];
      return { data: ids.map((id) => ({ id })) };
    }
    return { data: rows };
  }

  if (op.table === 'users') {
    const id = value('id');
    // `notifyPlayersGameStarted` leser `last_seen_at` for alle på én gang:
    // null = ikke i appen, så alle får varselet.
    if (Array.isArray(id)) {
      return { data: id.map((u) => ({ id: u, last_seen_at: null })) };
    }
    return { data: { is_admin: db.admins[String(id)] === true } };
  }

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

const rpcCalls: string[] = [];
async function rpc(name: string) {
  rpcCalls.push(name);
  if (name !== 'incomplete_profile_ids') throw new Error(`uventet rpc: ${name}`);
  return { data: db.pendingProfiles.map((id) => ({ id })), error: null };
}

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({ ...fake.client, rpc }),
}));
// Starten tømmer cachen, og `revalidateTag` kaster utenfor en Next-request.
vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
// Behold den ekte `shouldSendMailFallback`: `notifyPlayersGameStarted` deler
// spillerne i/utenfor appen med den.
vi.mock('@/lib/notifications/notify', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/notifications/notify')>();
  return { ...actual, notify: vi.fn(async () => ({ shouldAlsoSendMail: false })) };
});

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
  return new NextRequest(`http://localhost/api/games/${GAME_ID}/start${query}`, {
    method: 'POST',
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const ctx = () => ({ params: Promise.resolve({ id: GAME_ID }) });

/** Mottakerne av én varseltype, i kall-rekkefølge. */
const notified = (kind: string) =>
  notifyMock.mock.calls.filter(([n]) => n.kind === kind).map(([n]) => n.userId);

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  rpcCalls.length = 0;
  db = {
    games: {
      [GAME_ID]: game({ id: GAME_ID }),
      // Et avledet spill (#1441 D3): skal starte sammen med verten.
      [DERIVED_ID]: game({ id: DERIVED_ID, name: 'Back 9', source_game_id: GAME_ID }),
    },
    players: {
      [GAME_ID]: [
        { user_id: ORGANISER, withdrawn_at: null },
        { user_id: OLA, withdrawn_at: null },
        { user_id: PER, withdrawn_at: null },
        { user_id: WITHDRAWN, withdrawn_at: '2026-09-27T08:00:00+00:00' },
      ],
      [DERIVED_ID]: [
        { user_id: OLA, withdrawn_at: null },
        { user_id: PER, withdrawn_at: null },
      ],
    },
    admins: { [CLUB_ADMIN]: true },
    pendingProfiles: [],
    signups: {},
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

  it('en fremmed: 403, runden står planlagt og ingen varsler går', async () => {
    const res = await POST(request({ token: `Bearer ${STRANGER_TOKEN}` }), ctx());

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'forbidden' });
    expect(db.games[GAME_ID].status).toBe('scheduled');
    expect(fake.ops.some((op) => op.kind === 'update')).toBe(false);
    expect(fake.ops.some((op) => op.table === 'game_players')).toBe(false);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('ukjent spill-id: 404, også for en admin', async () => {
    delete db.games[GAME_ID];

    const res = await POST(request({ token: `Bearer ${ADMIN_TOKEN}` }), ctx());

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'not_found' });
    expect(fake.ops.some((op) => op.kind === 'update')).toBe(false);
  });
});

describe('POST — starten', () => {
  it('arrangøren vinner flippen: aktiv runde, avledet spill startet, game_started til de andre', async () => {
    const res = await POST(request({ token: `Bearer ${ORGANISER_TOKEN}` }), ctx());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ alreadyRunning: false });
    expect(db.games[GAME_ID].status).toBe('active');
    expect(db.games[DERIVED_ID].status).toBe('active');

    // Aktøren (tokenets bruker) og den trukne varsles aldri. Det avledede
    // spillet varsler ikke seg selv (#1450): alle game_started gjelder verten.
    expect(notified('game_started').sort()).toEqual([OLA, PER].sort());
    for (const [n] of notifyMock.mock.calls.filter(([c]) => c.kind === 'game_started')) {
      expect(n.payload).toMatchObject({ game_id: GAME_ID, game_name: 'Tirsdagsrunden' });
    }

    expect(revalidateTag).toHaveBeenCalledWith(`game-${GAME_ID}`, { expire: 0 });
    expect(revalidateTag).toHaveBeenCalledWith(`game-${DERIVED_ID}`, { expire: 0 });
  });

  it('en ventende påmelding avslås og får registration_expired (web-innpakningen, ikke den nakne kjernen)', async () => {
    db.signups[GAME_ID] = [
      { id: 'req-1', user_id: APPLICANT, status: 'pending', team_request_id: null },
    ];

    const res = await POST(request({ token: `Bearer ${ORGANISER_TOKEN}` }), ctx());

    expect(res.status).toBe(200);
    expect(notified('registration_expired')).toEqual([APPLICANT]);
  });

  it('noen andre vant flippen: 200 alreadyRunning, ingen utsending og ingen avledet start', async () => {
    db.games[GAME_ID].status = 'active';

    const res = await POST(request({ token: `Bearer ${ORGANISER_TOKEN}` }), ctx());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ alreadyRunning: true });
    expect(notifyMock).not.toHaveBeenCalled();
    expect(db.games[DERIVED_ID].status).toBe('scheduled');
    expect(fake.ops.some((op) => op.filters.some((f) => f.column === 'source_game_id'))).toBe(
      false,
    );
    // Cachen tømmes likevel, så appen og webben ser den aktive runden nå.
    expect(revalidateTag).toHaveBeenCalledWith(`game-${GAME_ID}`, { expire: 0 });
  });

  it('en admin som ikke opprettet runden kan starte den', async () => {
    const res = await POST(request({ token: `Bearer ${ADMIN_TOKEN}` }), ctx());

    expect(res.status).toBe(200);
    // Admin står ikke på rosteret, så alle tre aktive får varselet.
    expect(notified('game_started').sort()).toEqual([ORGANISER, OLA, PER].sort());
  });
});

describe('POST — avvisninger', () => {
  it('uten tee: 409 med kjernens grunn, ingen flipp og ingen varsler', async () => {
    db.games[GAME_ID].tee_box_id = null;

    const res = await POST(request({ token: `Bearer ${ORGANISER_TOKEN}` }), ctx());

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: 'tee_missing' });
    expect(db.games[GAME_ID].status).toBe('scheduled');
    expect(notifyMock).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('feil antall i wolf: 409 bærer rotasjonsfeltene videre', async () => {
    db.games[GAME_ID].game_mode = 'wolf';
    db.players[GAME_ID] = [
      { user_id: ORGANISER, withdrawn_at: null },
      { user_id: OLA, withdrawn_at: null },
    ];

    const res = await POST(request({ token: `Bearer ${ORGANISER_TOKEN}` }), ctx());

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: 'rotation_player_count',
      rotationMode: 'wolf',
      rotationActiveCount: 2,
    });
  });

  it('uferdige profiler: 409 pending_players uten ids eller adresser på tråden', async () => {
    db.pendingProfiles = [OLA];

    const res = await POST(request({ token: `Bearer ${ORGANISER_TOKEN}` }), ctx());

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: 'pending_players' });
    expect(rpcCalls).toEqual(['incomplete_profile_ids']);
    expect(db.games[GAME_ID].status).toBe('scheduled');
  });

  it('et kast under starten blir 500 med en ugjennomsiktig kode', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.coreThrows = true;

    const res = await POST(request({ token: `Bearer ${ORGANISER_TOKEN}` }), ctx());

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'start_failed' });
    expect(errorSpy).toHaveBeenCalledWith('[api/games/[id]/start] start threw', expect.any(Error));
    expect(notifyMock).not.toHaveBeenCalled();
  });
});

describe('identitet', () => {
  it('spill- og bruker-id i kropp og query har NULL effekt — stien og tokenet er kildene', async () => {
    delete db.games[DERIVED_ID];

    const res = await POST(
      request({
        token: `Bearer ${ORGANISER_TOKEN}`,
        query: `?gameId=${OTHER_GAME}&userId=${STRANGER}`,
        body: { gameId: OTHER_GAME, userId: STRANGER, actorUserId: STRANGER },
      }),
      ctx(),
    );

    expect(res.status).toBe(200);
    for (const op of fake.ops) {
      const gameFilter = op.filters.find(
        (f) =>
          f.column === 'game_id' ||
          f.column === 'source_game_id' ||
          (f.column === 'id' && op.table === 'games'),
      );
      if (gameFilter) expect(gameFilter.value).toBe(GAME_ID);
    }
    // Aktøren er tokenets bruker: arrangøren utelates, ikke id-en i kroppen.
    expect(notified('game_started').sort()).toEqual([OLA, PER].sort());
  });
});
