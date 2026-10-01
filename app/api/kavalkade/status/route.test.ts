// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createAdminClientMock,
  type QueryOp,
  type QueryResponse,
} from '@/lib/supabase/testing/adminClientMock';
import { KAVALKADE_CUTOFF } from '@/lib/kavalkade/release';

/**
 * Type A (#2265): status-rutas port og svar.
 *
 * Adgangssjekken (`authenticatedUserId`), admin-regelen (`isAdmin`),
 * rundetellingen (`hasFinishedRoundInKavalkadeYear`) og dato-reglene
 * (`release.ts`) er de ekte. Bare Supabase er byttet: service-klienten, og
 * klienten med kallerens token (`callerScopedClient`), som snakker HTTP.
 * Grensene i `release.ts` har sin egen suite; her sjekkes at ruta setter dem
 * sammen riktig — og at den aldri bygger en kavalkade eller kaller modellen.
 *
 * Klokka fryses relativt til `KAVALKADE_CUTOFF`, aldri til «nå» (T5 steg 3).
 */

const PLAYER = 'spiller';
const ADMIN = 'klubb-admin';
const TOKENS: Record<string, string> = {
  'token-spiller': PLAYER,
  'token-admin': ADMIN,
};
const bearer = (userId: string) =>
  `Bearer ${Object.keys(TOKENS).find((t) => TOKENS[t] === userId)}`;

const DAY_MS = 24 * 60 * 60 * 1000;
const at = (offsetDays: number) => new Date(KAVALKADE_CUTOFF.getTime() + offsetDays * DAY_MS);
/** Før teaser-vinduet (som starter 1. desember). */
const OCTOBER = at(-80);
/** I teaser-vinduet, dagen før åpningen. */
const DEC_23 = at(-1);
/** I lenke-vinduet, dagen etter åpningen. */
const DEC_25 = at(1);

let db: {
  /** Kallerens ferdige runder, slik RLS-lesingen svarer. */
  rounds: { games: { scheduled_tee_off_at: string | null; ended_at: string | null } }[];
  /** `callerScopedClient` gir `null` (ingen anon-nøkkel i miljøet). */
  noViewer: boolean;
  /** Admin-oppslaget kaster, slik en nettverksfeil ville gjort. */
  adminLookupThrows: boolean;
};

function respond(op: QueryOp): QueryResponse {
  if (op.table === 'users' && op.kind === 'select') {
    if (db.adminLookupThrows) throw new Error('connection reset');
    const id = op.filters.find((f) => f.column === 'id')?.value;
    return { data: { is_admin: id === ADMIN } };
  }
  throw new Error(`uventet spørring: ${op.kind} ${op.table}`);
}

const fake = createAdminClientMock({ tokens: TOKENS, respond: (op) => respond(op) });

/** Klienten med kallerens token. Den svarer bare på rundetellingen. */
const viewer = createAdminClientMock({
  respond: (op) => {
    if (op.table !== 'game_players' || op.kind !== 'select') {
      throw new Error(`uventet viewer-spørring: ${op.kind} ${op.table}`);
    }
    return { data: db.rounds };
  },
});
/** Hvilket Authorization-header viewer-klienten ble bygd fra. */
const viewerBuiltFrom: string[] = [];

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => fake.client,
}));
vi.mock('@/lib/api/appAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/appAuth')>();
  return {
    ...actual,
    callerScopedClient: (req: Request) => {
      viewerBuiltFrom.push(req.headers.get('authorization') ?? '');
      return db.noViewer ? null : viewer.client;
    },
  };
});
// `isAdmin` er den ekte; inngangsdøren byttes med en spion så testen kan
// bevise at status aldri bygger en kavalkade.
const getOrCreateSpy = vi.fn();
vi.mock('@/lib/kavalkade/getOrCreateKavalkade', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/kavalkade/getOrCreateKavalkade')>();
  return { ...actual, getOrCreateKavalkade: (...args: unknown[]) => getOrCreateSpy(...args) };
});
const narrativeSpy = vi.fn();
vi.mock('@/lib/kavalkade/generateKavalkadeNarrative', () => ({
  generateKavalkadeNarrative: (...args: unknown[]) => narrativeSpy(...args),
}));

import { NextRequest } from 'next/server';
import { GET } from './route';

function request(token?: string) {
  const headers: Record<string, string> = {};
  if (token !== undefined) headers.authorization = token;
  return new NextRequest('http://localhost/api/kavalkade/status', { headers });
}

/** En ferdig runde midt i kavalkade-året. */
const JUNE_ROUND = {
  games: {
    scheduled_tee_off_at: '2026-06-15T08:00:00.000Z',
    ended_at: '2026-06-15T13:00:00.000Z',
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  viewer.reset();
  viewerBuiltFrom.length = 0;
  db = { rounds: [JUNE_ROUND], noViewer: false, adminLookupThrows: false };
  // Staging-overstyringen og prod-bryteren skal ikke lekke inn fra miljøet.
  vi.stubEnv('KAVALKADE_OPEN_AT', '');
  vi.stubEnv('VERCEL_ENV', '');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(DEC_23);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

/** Ruta leser, skriver aldri, og bygger aldri en kavalkade. */
function expectReadOnly() {
  expect([...fake.ops, ...viewer.ops].every((op) => op.kind === 'select')).toBe(true);
  expect(getOrCreateSpy).not.toHaveBeenCalled();
  expect(narrativeSpy).not.toHaveBeenCalled();
}

describe('porten', () => {
  it('uten Authorization-header: 401 før noe leses', async () => {
    const res = await GET(request());

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
    expect(fake.getUserCalls).toEqual([]);
    expect(fake.ops).toEqual([]);
    expect(viewerBuiltFrom).toEqual([]);
  });

  it('med et token GoTrue avviser: 401, ingenting leses', async () => {
    const res = await GET(request('Bearer utgatt-token'));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
    expect(fake.ops).toEqual([]);
    expect(viewer.ops).toEqual([]);
  });
});

describe('GET — svaret', () => {
  it('før teaser-vinduet: alle fire feltene, ingen plass på Hjem', async () => {
    vi.setSystemTime(OCTOBER);

    const res = await GET(request(bearer(PLAYER)));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      year: 2026,
      slot: null,
      canOpen: false,
      hasRound: true,
    });
    expectReadOnly();
  });

  it('en spiller dagen før åpningen: teaser, men kan ikke åpne', async () => {
    const res = await GET(request(bearer(PLAYER)));

    await expect(res.json()).resolves.toEqual({
      year: 2026,
      slot: 'teaser',
      canOpen: false,
      hasRound: true,
    });
    expectReadOnly();
  });

  it('en admin dagen før åpningen: kan åpne (forhåndsvisningen)', async () => {
    const res = await GET(request(bearer(ADMIN)));

    await expect(res.json()).resolves.toEqual({
      year: 2026,
      slot: 'teaser',
      canOpen: true,
      hasRound: true,
    });
    expectReadOnly();
  });

  it('etter åpningen: alle kan åpne, og admin-oppslaget spares', async () => {
    vi.setSystemTime(DEC_25);

    const res = await GET(request(bearer(PLAYER)));

    await expect(res.json()).resolves.toEqual({
      year: 2026,
      slot: 'link',
      canOpen: true,
      hasRound: true,
    });
    expect(fake.ops.filter((op) => op.table === 'users')).toEqual([]);
    expectReadOnly();
  });

  it('serverens miljø eier datoen: KAVALKADE_OPEN_AT åpner for appen også', async () => {
    vi.setSystemTime(OCTOBER);
    vi.stubEnv('KAVALKADE_OPEN_AT', at(-81).toISOString());

    const res = await GET(request(bearer(PLAYER)));

    await expect(res.json()).resolves.toMatchObject({ slot: 'link', canOpen: true });
  });

  it('rundene leses som kalleren, med kallerens token', async () => {
    await GET(request(bearer(PLAYER)));

    expect(viewerBuiltFrom).toEqual([bearer(PLAYER)]);
    expect(viewer.ops).toEqual([
      expect.objectContaining({
        table: 'game_players',
        filters: expect.arrayContaining([{ op: 'eq', column: 'user_id', value: PLAYER }]),
      }),
    ]);
  });

  it('uten ferdige runder i året: hasRound false', async () => {
    db.rounds = [];

    const res = await GET(request(bearer(PLAYER)));

    await expect(res.json()).resolves.toMatchObject({ hasRound: false });
  });

  it('uten klient som leser som kalleren: hasRound false, ingen service-lesing av runder', async () => {
    db.noViewer = true;

    const res = await GET(request(bearer(PLAYER)));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ hasRound: false });
    expect(fake.ops.filter((op) => op.table === 'game_players')).toEqual([]);
  });
});

describe('feil under panseret', () => {
  it('et kast blir 500 med en ugjennomsiktig kode', async () => {
    db.adminLookupThrows = true;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await GET(request(bearer(PLAYER)));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'status_failed' });
    expect(errorSpy).toHaveBeenCalledWith(
      '[api/kavalkade/status] status failed',
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });
});
