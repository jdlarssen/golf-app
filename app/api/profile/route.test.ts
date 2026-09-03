// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAdminClientMock,
  type QueryOp,
  type QueryResponse,
} from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#1906): rutas port og transport.
 *
 * Adgangssjekken (`lib/api/appAuth.ts`) og valideringen
 * (`lib/users/profileInput.ts`) er IKKE stubbet — dette er en auth-flate, og
 * det som må bevises er at lagene henger sammen i praksis: at et avvist token
 * aldri når databasen, at en `userId` i kroppen ikke kan flytte skrivingen til
 * en annens rad, og at det signerte handicapet går uendret hele veien.
 *
 * Det fila bevisst IKKE re-asserterer: hver enkelt valideringsgren (grensene,
 * komma-parsing, «tom gender betyr la stå») — de har sin egen suite i
 * `lib/users/profileInput.test.ts`. Her sjekkes bare at hver av de fire kodene
 * kommer ut som 400 uten at noe skrives.
 *
 * `recomputeCourseHandicapForUser` er stubbet: den er en egen Type A-suite
 * (`lib/games/recomputeCourseHandicap.test.ts`), og her er poenget kun at ruta
 * kaller den med riktig verdi og overlever at den kaster.
 */

const USER = 'meg-selv';
const OTHER = 'en-annen';
const TOKEN = 'token-meg';

let db: {
  /** Rader `update … .select()` svarer med. Tom liste = stille 0-rads-skriving. */
  updated: { id: string }[];
  /** Settes for å bevise at et DB-kast blir 500, ikke en halv 200. */
  updateThrows: boolean;
};

function respond(op: QueryOp): QueryResponse {
  if (op.table === 'users' && op.kind === 'update') {
    if (db.updateThrows) throw new Error('connection reset');
    return { data: db.updated };
  }
  throw new Error(`uventet spørring: ${op.kind} ${op.table}`);
}

const fake = createAdminClientMock({
  tokens: { [TOKEN]: USER },
  respond: (op) => respond(op),
});

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => fake.client,
}));
vi.mock('@/lib/games/recomputeCourseHandicap', () => ({
  recomputeCourseHandicapForUser: vi.fn(),
}));

import { NextRequest } from 'next/server';
import { recomputeCourseHandicapForUser } from '@/lib/games/recomputeCourseHandicap';
import { PUT } from './route';

const recomputeMock = vi.mocked(recomputeCourseHandicapForUser);

/** Et fullt gyldig sett felter — testene overstyrer det de handler om. */
const VALID = {
  name: 'Jørgen Larssen',
  nickname: 'JL',
  hcpIndex: '12,4',
  hcpPlus: false,
  gender: 'mens',
  level: 'normal',
};

function request({
  token,
  body = VALID,
  rawBody,
}: {
  token?: string;
  body?: unknown;
  rawBody?: string;
} = {}) {
  const headers: Record<string, string> = {};
  if (token !== undefined) headers.authorization = token;
  return new NextRequest('http://localhost/api/profile', {
    method: 'PUT',
    headers,
    body: rawBody ?? JSON.stringify(body),
  });
}

/** Update-en mot `users`, eller `undefined` når ingen skriving skjedde. */
function writeOp() {
  return fake.ops.find((op) => op.table === 'users' && op.kind === 'update');
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  db = { updated: [{ id: USER }], updateThrows: false };
});

describe('porten', () => {
  it('uten Authorization-header: 401 før databasen røres', async () => {
    const res = await PUT(request({ body: VALID }));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
    // Ingen GoTrue-rundtur heller — headeren avvises lokalt.
    expect(fake.getUserCalls).toEqual([]);
    expect(fake.ops).toEqual([]);
    expect(recomputeMock).not.toHaveBeenCalled();
  });

  it('med et token GoTrue avviser: 401, ingenting skrives', async () => {
    const res = await PUT(request({ token: 'Bearer utgatt-token' }));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
    // Tokenet ble faktisk sendt til validering — koblingen er bevist.
    expect(fake.getUserCalls).toEqual(['utgatt-token']);
    expect(fake.ops).toEqual([]);
    expect(recomputeMock).not.toHaveBeenCalled();
  });
});

describe('validering — de fire kodene', () => {
  it.each([
    ['name_required', { ...VALID, name: '   ' }],
    ['hcp_invalid', { ...VALID, hcpIndex: 'sekstini' }],
    ['gender_required', { ...VALID, gender: 'annet' }],
    ['level_invalid', { ...VALID, level: '' }],
  ])('%s: 400 uten at noe skrives', async (code, body) => {
    const res = await PUT(request({ token: `Bearer ${TOKEN}`, body }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: code });
    expect(writeOp()).toBeUndefined();
    expect(recomputeMock).not.toHaveBeenCalled();
  });

  it('en uleselig kropp blir 400, ikke 500', async () => {
    const res = await PUT(request({ token: `Bearer ${TOKEN}`, rawBody: 'ikke json{' }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'name_required' });
    expect(writeOp()).toBeUndefined();
  });
});

describe('lagringen', () => {
  it('skriver de fem feltene pluss de to stemplene på tokenets rad', async () => {
    const res = await PUT(request({ token: `Bearer ${TOKEN}` }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });

    const op = writeOp();
    expect(op?.filters).toEqual([{ op: 'eq', column: 'id', value: USER }]);
    expect(op?.payload).toMatchObject({
      name: 'Jørgen Larssen',
      nickname: 'JL',
      hcp_index: 12.4,
      gender: 'mens',
      level: 'normal',
    });
    expect(op?.payload?.handicap_updated_at).toEqual(expect.any(String));
    expect(op?.payload?.profile_completed_at).toEqual(expect.any(String));
  });

  it('plusshandicap lagres SIGNERT (negativt)', async () => {
    const res = await PUT(
      request({
        token: `Bearer ${TOKEN}`,
        body: { ...VALID, hcpIndex: '1,5', hcpPlus: true },
      }),
    );

    expect(res.status).toBe(200);
    expect(writeOp()?.payload?.hcp_index).toBe(-1.5);
  });

  it('en userId i kroppen ignoreres — id-en kommer fra tokenet', async () => {
    const res = await PUT(
      request({
        token: `Bearer ${TOKEN}`,
        body: { ...VALID, userId: OTHER, id: OTHER },
      }),
    );

    expect(res.status).toBe(200);
    // Hvert eneste filter-ledd i skrivingen peker på tokenets bruker.
    const ids = fake.ops.flatMap((op) => op.filters).map((f) => f.value);
    expect(ids).toEqual([USER]);
    expect(recomputeMock).toHaveBeenCalledWith(USER, expect.any(Number));
  });

  it('tom gender utelates fra payloaden så raden beholder verdien sin (#1064)', async () => {
    const res = await PUT(
      request({ token: `Bearer ${TOKEN}`, body: { ...VALID, gender: '' } }),
    );

    expect(res.status).toBe(200);
    expect(writeOp()?.payload).not.toHaveProperty('gender');
  });

  it('0 rader oppdatert: 500 update_failed', async () => {
    db.updated = [];
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await PUT(request({ token: `Bearer ${TOKEN}` }));

    expect(res.status).toBe(500);
    // Aldri `err.message` på tråden — endepunktet er offentlig eksponert.
    await expect(res.json()).resolves.toEqual({ error: 'update_failed' });
    expect(errorSpy).toHaveBeenCalledWith('[api/profile] update failed', expect.any(Error));
    // Ingen recompute på en rad som aldri ble skrevet.
    expect(recomputeMock).not.toHaveBeenCalled();
  });

  it('DB-en kaster: 500 update_failed', async () => {
    db.updateThrows = true;
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await PUT(request({ token: `Bearer ${TOKEN}` }));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'update_failed' });
    expect(recomputeMock).not.toHaveBeenCalled();
  });
});

describe('recompute — best-effort', () => {
  it('kalles med den SIGNERTE hcp-verdien', async () => {
    await PUT(
      request({
        token: `Bearer ${TOKEN}`,
        body: { ...VALID, hcpIndex: '1,5', hcpPlus: true },
      }),
    );

    expect(recomputeMock).toHaveBeenCalledWith(USER, -1.5);
  });

  it('et kast gjør IKKE lagringen mislykket — raden er skrevet', async () => {
    recomputeMock.mockRejectedValueOnce(new Error('tee mangler rating'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await PUT(request({ token: `Bearer ${TOKEN}` }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(errorSpy).toHaveBeenCalledWith(
      '[api/profile] course-handicap recompute threw',
      expect.any(Error),
    );
  });
});
