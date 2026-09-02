// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Type A (#1876): rutas port og transport — hvem den slipper inn, hvilken
 * id den videresender, og hvilke koder som havner på tråden.
 *
 * Det denne fila bevisst IKKE re-asserterer: selve blokk-regelen og
 * hard-vs-anonymiser-forgreningen, som er Type A i
 * `lib/users/deleteAccount.test.ts`. Hjelperne er stubbet her nettopp for at
 * ruta ikke skal bli et andre hjem for reglene.
 *
 * Auth-porten er IKKE stubbet: header-parsingen og `auth.getUser(token)`-
 * koblingen kjøres ekte, kun GoTrue-rundturen er mocket. Hver avvisning
 * kontrolleres derfor med negativt bevis — at ingen privilegert hjelper ble
 * rørt før porten hadde svart.
 */

/** Tokenene ruta faktisk sendte til GoTrue. Tom = ingen rundtur ble gjort. */
const getUserCalls: string[] = [];
/** Bruker-id-ene blokk-sjekken ble spurt om. Tom = DB-en ble aldri rørt. */
const blockChecks: string[] = [];
/** `[userId, logPrefix]` per faktisk slettekall. */
const deleteCalls: Array<[string, string]> = [];

/** Tokenet GoTrue godtar; alt annet svarer som et avvist token. */
const VALID_TOKEN = 'gyldig-token';
const TOKEN_USER_ID = 'user-fra-token';

/** Settes av testen som beviser at manglende service-nøkkel gir 500. */
let adminClientThrows = false;

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => {
    if (adminClientThrows) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
    return {
      auth: {
        // Speiler auth-js: ugyldig token gir { data: { user: null }, error }.
        getUser: (jwt: string) => {
          getUserCalls.push(jwt);
          if (jwt !== VALID_TOKEN) {
            return Promise.resolve({
              data: { user: null },
              error: { message: 'invalid JWT' },
            });
          }
          return Promise.resolve({
            data: { user: { id: TOKEN_USER_ID } },
            error: null,
          });
        },
      },
      from: (table: string) => {
        throw new Error(`unexpected from(${table}) call`);
      },
    };
  },
}));

vi.mock('@/lib/users/deleteAccount', () => ({
  getDeleteBlockReason: vi.fn(),
  deleteOrAnonymizeUser: vi.fn(),
}));

import { NextRequest } from 'next/server';
import {
  deleteOrAnonymizeUser,
  getDeleteBlockReason,
} from '@/lib/users/deleteAccount';
import { GET, POST } from './route';

const blockReasonMock = vi.mocked(getDeleteBlockReason);
const deleteMock = vi.mocked(deleteOrAnonymizeUser);

function request(
  method: 'GET' | 'POST',
  { token, body }: { token?: string | null; body?: unknown } = {},
) {
  const headers: Record<string, string> = {};
  if (token !== undefined && token !== null) headers.authorization = token;
  return new NextRequest('http://localhost/api/account/delete', {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

/** Ingen hjelper ble rørt — porten svarte først. */
function expectNothingPrivilegedRan() {
  expect(blockChecks).toEqual([]);
  expect(deleteCalls).toEqual([]);
  expect(blockReasonMock).not.toHaveBeenCalled();
  expect(deleteMock).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserCalls.length = 0;
  blockChecks.length = 0;
  deleteCalls.length = 0;
  adminClientThrows = false;
  blockReasonMock.mockImplementation(async (userId: string) => {
    blockChecks.push(userId);
    return null;
  });
  deleteMock.mockImplementation(async (userId: string, logPrefix: string) => {
    deleteCalls.push([userId, logPrefix]);
    return { ok: true, mode: 'anonymized' };
  });
});

describe('POST /api/account/delete — porten', () => {
  it('uten Authorization-header: 401 før noe som helst leses', async () => {
    const res = await POST(request('POST'));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
    // Ingen GoTrue-rundtur heller — headeren avvises lokalt.
    expect(getUserCalls).toEqual([]);
    expectNothingPrivilegedRan();
  });

  it('feilformet Authorization-header: 401 uten GoTrue-rundtur', async () => {
    const res = await POST(request('POST', { token: VALID_TOKEN }));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
    expect(getUserCalls).toEqual([]);
    expectNothingPrivilegedRan();
  });

  it('token GoTrue avviser: 401, og ingenting privilegert kjøres', async () => {
    const res = await POST(request('POST', { token: 'Bearer utgatt-token' }));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
    // Tokenet ble faktisk sendt til validering — koblingen er bevist, ikke antatt.
    expect(getUserCalls).toEqual(['utgatt-token']);
    expectNothingPrivilegedRan();
  });
});

describe('POST /api/account/delete — sletting', () => {
  it('sletter kontoen tokenet peker på, med rutas logg-prefiks', async () => {
    deleteMock.mockImplementation(async (userId: string, logPrefix: string) => {
      deleteCalls.push([userId, logPrefix]);
      return { ok: true, mode: 'hard' };
    });

    const res = await POST(request('POST', { token: `Bearer ${VALID_TOKEN}` }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ mode: 'hard' });
    expect(blockChecks).toEqual([TOKEN_USER_ID]);
    expect(deleteCalls).toEqual([[TOKEN_USER_ID, '[api/account/delete]']]);
  });

  it('userId i body ignoreres — id-en kommer kun fra tokenet', async () => {
    const res = await POST(
      request('POST', {
        token: `Bearer ${VALID_TOKEN}`,
        body: { userId: 'et-annet-offer' },
      }),
    );

    expect(res.status).toBe(200);
    expect(blockChecks).toEqual([TOKEN_USER_ID]);
    expect(deleteCalls).toEqual([[TOKEN_USER_ID, '[api/account/delete]']]);
  });

  it.each(['admin_account', 'active_engagements'] as const)(
    'blokkert (%s): 403 med hjelperens egen kode, og ingen sletting',
    async (reason) => {
      blockReasonMock.mockImplementation(async (userId: string) => {
        blockChecks.push(userId);
        return reason;
      });

      const res = await POST(request('POST', { token: `Bearer ${VALID_TOKEN}` }));

      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({ error: reason });
      expect(blockChecks).toEqual([TOKEN_USER_ID]);
      expect(deleteCalls).toEqual([]);
    },
  );

  it('hjelperen svarer { ok: false }: 500 med ugjennomsiktig kode', async () => {
    deleteMock.mockImplementation(async (userId: string, logPrefix: string) => {
      deleteCalls.push([userId, logPrefix]);
      return { ok: false, reason: 'failed' };
    });

    const res = await POST(request('POST', { token: `Bearer ${VALID_TOKEN}` }));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'delete_failed' });
    expect(deleteCalls).toEqual([[TOKEN_USER_ID, '[api/account/delete]']]);
  });

  it('manglende service-nøkkel (getAdminClient kaster): 500, ikke 401', async () => {
    adminClientThrows = true;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(request('POST', { token: `Bearer ${VALID_TOKEN}` }));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'delete_failed' });
    expectNothingPrivilegedRan();
    expect(errorSpy).toHaveBeenCalledWith(
      '[api/account/delete] delete threw',
      expect.any(Error),
    );
  });
});

describe('GET /api/account/delete', () => {
  it.each([null, 'admin_account', 'active_engagements'] as const)(
    'rapporterer blokk-status %s for brukeren i tokenet',
    async (reason) => {
      blockReasonMock.mockImplementation(async (userId: string) => {
        blockChecks.push(userId);
        return reason;
      });

      const res = await GET(request('GET', { token: `Bearer ${VALID_TOKEN}` }));

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ blocked: reason });
      expect(blockChecks).toEqual([TOKEN_USER_ID]);
    },
  );

  it('uten gyldig token: 401 uten å slå opp blokk-status', async () => {
    const res = await GET(request('GET', { token: 'Bearer utgatt-token' }));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
    expectNothingPrivilegedRan();
  });

  it('manglende service-nøkkel (getAdminClient kaster): 500 status_failed', async () => {
    adminClientThrows = true;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await GET(request('GET', { token: `Bearer ${VALID_TOKEN}` }));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'status_failed' });
    expectNothingPrivilegedRan();
    expect(errorSpy).toHaveBeenCalledWith(
      '[api/account/delete] status failed',
      expect.any(Error),
    );
  });
});
