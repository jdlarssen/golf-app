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
 * (`addExistingPlayerToGameCore`) eller varsel-helperen (`notifyInvitedToGame`)
 * er stubbet — bare Supabase, `notify` og to hjelpere med egne doble:
 *
 *  - `getInviteEligibleIds` styres per test. Resolveren leser vennskap med
 *    `.or()` og medspillere med `.neq()`, og den registrerende dobbelen
 *    modellerer ingen av dem. Det som må bevises her er at kjernen spør den med
 *    den EKTE kalleren, og at svaret stopper skrivingen — det asserteres.
 *  - `joinTeeGenders` er den delte dobbelen (#2209), som i action-testene.
 *
 * ⚠️ Service-role no-op-er 0115-triggeren, så venne-porten i kjernen er den
 * eneste sjekken på denne stien. Derfor er de fiendtlige tilfellene under
 * (ikke-kvalifisert mottaker, `isAdmin` i kroppen) hele poenget med fila.
 *
 * Grenene i kjernen (tak, lås, duplikat) har sin egen suite i
 * `lib/games/inviteToGame.test.ts`; her står én representant per status.
 */

const GAME_ID = '22222222-2222-2222-2222-222222222222';
const ORGANISER = '11111111-1111-1111-1111-111111111111';
const RECIPIENT = '33333333-3333-3333-3333-333333333333';
const STRANGER = '99999999-9999-9999-9999-999999999999';
const CLUB_ADMIN = '77777777-7777-7777-7777-777777777777';
const OTHER_GAME = '88888888-8888-8888-8888-888888888888';

const ORGANISER_TOKEN = 'token-arrangor';
const STRANGER_TOKEN = 'token-fremmed';
const ADMIN_TOKEN = 'token-admin';

let db: {
  /** `false` = spillet finnes ikke. */
  gameExists: boolean;
  status: string;
  /** `users.is_admin` per bruker-id. */
  admins: Record<string, boolean>;
  /** Hvem som alt står på rosteret — en ny insert for dem er 23505. */
  roster: Set<string>;
  /** Radene som faktisk ble skrevet. */
  inserted: Record<string, unknown>[];
  /** Settes for å bevise at et kast blir 500, ikke en halv 200. */
  coreThrows: boolean;
};

/** Postgres' svar på en andre rad for (game_id, user_id). */
const UNIQUE_VIOLATION = { message: 'duplicate key value', code: '23505' };

function respond(op: QueryOp): QueryResponse {
  const value = (column: string) =>
    op.filters.find((f) => f.column === column)?.value;

  if (op.table === 'games') {
    // `gameOrganiserAccess` spør først (`created_by`); kast etter porten.
    if (db.coreThrows && op.columns !== 'created_by') {
      throw new Error('connection reset');
    }
    return {
      data:
        db.gameExists && value('id') === GAME_ID
          ? {
              id: GAME_ID,
              created_by: ORGANISER,
              name: 'Tirsdagsrunden',
              status: db.status,
              game_mode: 'solo_strokeplay',
              group_id: null,
              mode_config: null,
            }
          : null,
    };
  }

  if (op.table === 'users') {
    const id = String(value('id'));
    return {
      data: { id, is_admin: db.admins[id] === true, name: 'Kari', email: null },
    };
  }

  if (op.table === 'game_players') {
    if (op.kind === 'insert') {
      const userId = String(op.payload?.user_id);
      if (db.roster.has(userId)) {
        return { data: null, error: UNIQUE_VIOLATION };
      }
      db.roster.add(userId);
      db.inserted.push(op.payload ?? {});
      return { data: null };
    }
    // Format-taket teller aktive rader (solo-slagspill har ingen tak, men svar likevel).
    return { data: null, count: db.roster.size };
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

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => fake.client,
}));
// Kjernen tømmer cachen selv, og `revalidateTag` kaster utenfor en Next-request.
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));
vi.mock('@/lib/notifications/notify', () => ({
  notify: vi.fn(async () => ({ shouldAlsoSendMail: false })),
}));
vi.mock('@/lib/games/joinTeeGenders');

const eligibleMock = vi.fn<(inviter: string, groupId: string | null) => Promise<Set<string>>>();
vi.mock('@/lib/games/inviteEligibility', () => ({
  getInviteEligibleIds: (inviter: string, groupId: string | null) =>
    eligibleMock(inviter, groupId),
}));

import { NextRequest } from 'next/server';
import { revalidateTag } from 'next/cache';
import { notify } from '@/lib/notifications/notify';
import { joinTeeGenders } from '@/lib/games/joinTeeGenders';
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
    `http://localhost/api/games/${GAME_ID}/players/${RECIPIENT}${query}`,
    {
      method: 'POST',
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
}

/** Rute-konteksten Next gir handleren — `params` er en Promise i Next 16. */
const ctx = (recipient = RECIPIENT) => ({
  params: Promise.resolve({ id: GAME_ID, userId: recipient }),
});

const rosterOps = () => fake.ops.filter((op) => op.table === 'game_players');

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  eligibleMock.mockReset();
  eligibleMock.mockResolvedValue(new Set([RECIPIENT]));
  db = {
    gameExists: true,
    status: 'scheduled',
    admins: { [CLUB_ADMIN]: true },
    roster: new Set([ORGANISER]),
    inserted: [],
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

  it('en fremmed: 403, og rosteret er aldri rørt', async () => {
    const res = await POST(request({ token: `Bearer ${STRANGER_TOKEN}` }), ctx());

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'forbidden' });
    expect(rosterOps()).toEqual([]);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('ukjent spill-id: 404, også for en admin', async () => {
    // Ukjent svares som ukjent for ALLE, ellers lekker 404-vs-403 hvem som er
    // admin til en tilfeldig kaller.
    db.gameExists = false;

    const res = await POST(request({ token: `Bearer ${ADMIN_TOKEN}` }), ctx());

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'not_found' });
    expect(rosterOps()).toEqual([]);
  });
});

describe('venne-porten — den eneste sjekken under service-role', () => {
  it('arrangøren legger til en hen ikke kan invitere: 409 invite_not_allowed, ingen rad', async () => {
    eligibleMock.mockResolvedValue(new Set());

    const res = await POST(request({ token: `Bearer ${ORGANISER_TOKEN}` }), ctx());

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: 'invite_not_allowed' });
    // Spurt for den EKTE kalleren og spillets klubb.
    expect(eligibleMock).toHaveBeenCalledWith(ORGANISER, null);
    expect(db.inserted).toEqual([]);
    expect(rosterOps().some((op) => op.kind === 'insert')).toBe(false);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('en `isAdmin` i kroppen gir ikke admin-unntaket', async () => {
    eligibleMock.mockResolvedValue(new Set());

    const res = await POST(
      request({ token: `Bearer ${ORGANISER_TOKEN}`, body: { isAdmin: true, is_admin: true } }),
      ctx(),
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: 'invite_not_allowed' });
    expect(eligibleMock).toHaveBeenCalledTimes(1);
    expect(db.inserted).toEqual([]);
  });

  it('en ekte klubb-admin er unntatt (kurator-modellen) — flagget leses fra databasen', async () => {
    eligibleMock.mockResolvedValue(new Set());

    const res = await POST(request({ token: `Bearer ${ADMIN_TOKEN}` }), ctx());

    expect(res.status).toBe(200);
    expect(eligibleMock).not.toHaveBeenCalled();
    expect(db.inserted).toEqual([
      expect.objectContaining({ game_id: GAME_ID, user_id: RECIPIENT }),
    ]);
  });
});

describe('POST — legg til', () => {
  it('ny spiller får tee-kategorien fra profilen (#2209), ikke en standardverdi', async () => {
    // Appen satte kategorien selv da den skrev raden direkte; nå er det kjernen
    // bak ruta som gjør det, og regelen skal fortsatt holde på denne veien.
    vi.mocked(joinTeeGenders).mockResolvedValueOnce({ [RECIPIENT]: 'ladies' });

    const res = await POST(request({ token: `Bearer ${ORGANISER_TOKEN}` }), ctx());

    expect(res.status).toBe(200);
    expect(joinTeeGenders).toHaveBeenCalledWith(GAME_ID, [RECIPIENT]);
    expect(db.inserted).toEqual([
      expect.objectContaining({ user_id: RECIPIENT, tee_gender: 'ladies' }),
    ]);
  });

  it('ny spiller: 200, rad + invite-varsel + tømt cache', async () => {
    const res = await POST(request({ token: `Bearer ${ORGANISER_TOKEN}` }), ctx());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ alreadyOnRoster: false });
    expect(db.inserted).toEqual([
      expect.objectContaining({
        game_id: GAME_ID,
        user_id: RECIPIENT,
        // #463: arrangøren legger til en annen → ikke bekreftet ennå.
        accepted_at: null,
      }),
    ]);
    expect(notifyMock).toHaveBeenCalledExactlyOnceWith({
      userId: RECIPIENT,
      kind: 'invite',
      payload: expect.objectContaining({ game_id: GAME_ID, game_name: 'Tirsdagsrunden' }),
    });
    expect(revalidateTag).toHaveBeenCalledWith(`game-${GAME_ID}`, { expire: 0 });
  });

  it('allerede på rosteret: 200 alreadyOnRoster, INGEN nytt varsel', async () => {
    db.roster.add(RECIPIENT);

    const res = await POST(request({ token: `Bearer ${ORGANISER_TOKEN}` }), ctx());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ alreadyOnRoster: true });
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('en igangsatt runde: 409 game_locked, ingen rad', async () => {
    db.status = 'active';

    const res = await POST(request({ token: `Bearer ${ORGANISER_TOKEN}` }), ctx());

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: 'game_locked' });
    expect(db.inserted).toEqual([]);
  });

  it('spill- og bruker-id i kropp og query har NULL effekt — stien og tokenet er kildene', async () => {
    const res = await POST(
      request({
        token: `Bearer ${ORGANISER_TOKEN}`,
        query: `?gameId=${OTHER_GAME}&userId=${STRANGER}`,
        body: { gameId: OTHER_GAME, userId: STRANGER, recipientUserId: STRANGER },
      }),
      ctx(),
    );

    expect(res.status).toBe(200);
    expect(db.inserted).toEqual([
      expect.objectContaining({ game_id: GAME_ID, user_id: RECIPIENT }),
    ]);
    for (const op of fake.ops) {
      const gameFilter = op.filters.find(
        (f) => f.column === 'game_id' || (f.column === 'id' && op.table === 'games'),
      );
      if (gameFilter) expect(gameFilter.value).toBe(GAME_ID);
    }
    expect(eligibleMock).toHaveBeenCalledWith(ORGANISER, null);
  });

  it('et kast fra kjernen blir 500 med en ugjennomsiktig kode', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.coreThrows = true;

    const res = await POST(request({ token: `Bearer ${ORGANISER_TOKEN}` }), ctx());

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'add_failed' });
    expect(errorSpy).toHaveBeenCalledWith(
      '[api/games/[id]/players/[userId]] add threw',
      expect.any(Error),
    );
    expect(db.inserted).toEqual([]);
  });
});
