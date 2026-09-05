// native/app/src/data/profile.test.ts
// Native #1906: egen profilrad — lest med anon-klienten, skrevet gjennom ruta.
//
// **Lesingen:** at kolonnene faktisk blir bedt om (skjemaet fylles med
// `gender` og `level`, så en select som stille mister dem ville gitt et
// redigeringsskjema uten verdier), og at en feil fra PostgREST slipper UT som
// et kast i stedet for å bli til en tom profil spilleren prøver å fylle ut.
//
// **Skrivingen** har ett tyngdepunkt, og det er hvem som lagres. Ruta leser
// bruker-id-en fra tokenet, og kroppen skal derfor ALDRI bære en id — testen
// under låser at `saveProfile` ikke sender en, uansett hva som kommer inn.
// Ellers: at et svar aldri blir til noe annet enn det det var (hver status sin
// gren), og at en ukjent valideringskode ikke slippes videre til copy-laget,
// der den uttømmende switch-en ville gitt `undefined` som setning.
//
// Det som IKKE testes her: vakt-rekkefølgen (den er `webApi.ts` sin, og
// `webApi.test.ts` låser den) og hvilke setninger kodene betyr
// (`profileCopy.test.ts`). Denne fila kjenner bare koder.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import { useFreshModules } from '../test/harness';

jest.mock('../supabase', () => require('../test/supabaseMock'));

// Nett-status styres per test. `mock`-prefikset er jests egen regel for
// variabler en `jest.mock`-fabrikk får lov å lukke over.
const mockNetwork = { online: true };
jest.mock('./syncTriggers', () => ({
  isDeviceOnline: () => mockNetwork.online,
}));

const ME = 'user-me';
const BASE_URL = 'https://staging.example';
const PROFILE_URL = `${BASE_URL}/api/profile`;
const TOKEN = 'access-token-abc';

type Mocks = typeof import('../test/supabaseMock');
type Profile = typeof import('./profile');

function mocks(): Mocks {
  return require('../test/supabaseMock') as Mocks;
}

function profile(): Profile {
  return require('./profile') as Profile;
}

function auth(): Mocks['supabase']['auth'] {
  return (require('../test/supabaseMock') as Mocks).supabase.auth;
}

const ROW = {
  name: 'Jørgen Larssen',
  nickname: 'Jøggi',
  hcp_index: 14.2,
  handicap_updated_at: '2026-08-30T10:00:00.000Z',
  gender: 'male',
  level: 'intermediate',
  is_admin: false,
};

describe('fetchOwnProfile', () => {
  useFreshModules();

  it('mapper raden til camelCase og ber om alle sju kolonnene', async () => {
    const { queryStub, routeFrom, stepArgs } = mocks();
    const stub = queryStub({ data: ROW, error: null });
    routeFrom({ users: [stub] });

    expect(await profile().fetchOwnProfile(ME)).toEqual({
      name: 'Jørgen Larssen',
      nickname: 'Jøggi',
      hcpIndex: 14.2,
      handicapUpdatedAt: '2026-08-30T10:00:00.000Z',
      gender: 'male',
      level: 'intermediate',
      isAdmin: false,
    });

    expect(stepArgs(stub, 'select')[0]![0]).toBe(
      'name, nickname, hcp_index, handicap_updated_at, gender, level, is_admin',
    );
    // Egen rad, ingen andres: id-filteret ER hele avgrensningen.
    expect(stepArgs(stub, 'eq')).toEqual([['id', ME]]);
    expect(stepArgs(stub, 'single')).toHaveLength(1);
  });

  // Fail-closed: bare `true` er admin. En kolonne som mangler i svaret — en
  // eldre rad, en select som mistet feltet — skal gi den ærlige teksten, ikke
  // en knapp til en side som sender spilleren rett hjem igjen (#1934).
  it.each([
    [true, true],
    [false, false],
    [null, false],
    [undefined, false],
  ])('leser is_admin=%p som isAdmin=%p', async (value, expected) => {
    const { queryStub, routeFrom } = mocks();
    routeFrom({
      users: [queryStub({ data: { ...ROW, is_admin: value }, error: null })],
    });

    expect((await profile().fetchOwnProfile(ME)).isAdmin).toBe(expected);
  });

  it('lar tomme felt være tomme i stedet for å finne på en verdi', async () => {
    const { queryStub, routeFrom } = mocks();
    routeFrom({
      users: [
        queryStub({
          data: { ...ROW, name: null, nickname: null, hcp_index: null },
          error: null,
        }),
      ],
    });

    expect(await profile().fetchOwnProfile(ME)).toMatchObject({
      name: null,
      nickname: null,
      hcpIndex: null,
    });
  });

  it('kaster når PostgREST svarer med feil', async () => {
    const { queryStub, routeFrom } = mocks();
    routeFrom({
      users: [
        queryStub({
          data: null,
          // Formen `single()` gir når raden ikke finnes — for oss er det ikke
          // en tom profil, det er noe galt, og skjermen skal si fra.
          error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' },
        }),
      ],
    });

    await expect(profile().fetchOwnProfile(ME)).rejects.toThrow(
      'JSON object requested, multiple (or no) rows returned',
    );
  });
});

describe('saveProfile', () => {
  useFreshModules();

  const originalFetch = global.fetch;
  const mockFetch = jest.fn();

  /** Et gyldig skjema-utfylt sett. Testene endrer bare det de handler om. */
  const INPUT = {
    name: 'Jørgen Larssen',
    nickname: 'Jøggi',
    hcpIndex: '14,2',
    hcpPlus: false,
    gender: 'mens',
    level: 'normal',
  };

  function respondWith(status: number, body: unknown): void {
    mockFetch.mockResolvedValue({
      status,
      json: async () => body,
    } as unknown as Response);
  }

  function sentBody(): Record<string, unknown> {
    const init = mockFetch.mock.calls[0][1] as RequestInit;
    return JSON.parse(String(init.body)) as Record<string, unknown>;
  }

  beforeEach(() => {
    mockNetwork.online = true;
    mockFetch.mockReset();
    global.fetch = mockFetch as unknown as typeof fetch;
    process.env.EXPO_PUBLIC_WEB_BASE_URL = BASE_URL;

    auth().getSession.mockResolvedValue({
      data: { session: { access_token: TOKEN } },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
    delete process.env.EXPO_PUBLIC_WEB_BASE_URL;
  });

  it('sender feltene med PUT til profil-ruta', async () => {
    respondWith(200, { ok: true });

    expect(await profile().saveProfile(INPUT)).toEqual({ ok: true });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe(PROFILE_URL);
    expect((mockFetch.mock.calls[0][1] as RequestInit).method).toBe('PUT');
    expect(sentBody()).toEqual({
      name: 'Jørgen Larssen',
      nickname: 'Jøggi',
      // Rått, med norsk komma: parseren på serveren eier tallkonverteringen.
      hcpIndex: '14,2',
      hcpPlus: false,
      gender: 'mens',
      level: 'normal',
    });
  });

  it('sender ALDRI en bruker-id i kroppen', async () => {
    // Hvem som lagres er tokenets sak. Kommer det en id inn — fra en skjerm som
    // «hadde den for hånden», eller fra et senere tillegg — skal den ikke bli
    // med ut på nettet. Sender vi den aldri, finnes det ingen id å forveksle
    // med en annens.
    respondWith(200, { ok: true });

    await profile().saveProfile({
      ...INPUT,
      userId: 'noen-andre',
    } as unknown as Parameters<Profile['saveProfile']>[0]);

    const body = sentBody();
    expect(body).not.toHaveProperty('userId');
    expect(Object.keys(body).sort()).toEqual([
      'gender',
      'hcpIndex',
      'hcpPlus',
      'level',
      'name',
      'nickname',
    ]);
    expect(JSON.stringify(body)).not.toContain('noen-andre');
  });

  it('sender tomt kallenavn og uvalgt kjønn som null, ikke som tom streng', async () => {
    // `null` er «ikke satt» for kallenavn og «behold det som står» for kjønn.
    // En tom streng ville vært en tredje verdi ingen av lagene har en regel for.
    respondWith(200, { ok: true });

    await profile().saveProfile({ ...INPUT, nickname: null, gender: null });

    expect(sentBody()).toMatchObject({ nickname: null, gender: null });
  });

  it.each([
    'name_required',
    'hcp_invalid',
    'gender_required',
    'level_invalid',
  ])('gir videre valideringskoden «%s» fra en 400', async (error) => {
    respondWith(400, { error });

    expect(await profile().saveProfile(INPUT)).toEqual({ ok: false, reason: error });
  });

  it('oversetter en ukjent valideringskode til «update_failed»', async () => {
    // En kode utenfra slippes ALDRI videre: `describeProfileSaveFailure` har
    // en uttømmende switch uten `default`, og en fremmed streng ville blitt til
    // `undefined` på skjermen — en feilmelding uten tekst.
    respondWith(400, { error: 'nickname_taken' });

    expect(await profile().saveProfile(INPUT)).toEqual({
      ok: false,
      reason: 'update_failed',
    });
  });

  it('oversetter en 400 uten kode til «update_failed»', async () => {
    respondWith(400, {});

    expect(await profile().saveProfile(INPUT)).toEqual({
      ok: false,
      reason: 'update_failed',
    });
  });

  it.each([
    [401, 'unauthorized'],
    [403, 'update_failed'],
    [404, 'update_failed'],
    [500, 'update_failed'],
  ])('oversetter %i til %s', async (status, reason) => {
    respondWith(status, { error: 'noe' });

    expect(await profile().saveProfile(INPUT)).toEqual({ ok: false, reason });
  });

  it('lagrer ikke uten nett', async () => {
    // Skrivingen har ingen lokal-først-vei: regelen kjøres på serveren, så
    // uten nett skjer det ingenting — og det skal appen si.
    mockNetwork.online = false;

    expect(await profile().saveProfile(INPUT)).toEqual({
      ok: false,
      reason: 'offline',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sier ifra når server-adressen mangler i bygget', async () => {
    delete process.env.EXPO_PUBLIC_WEB_BASE_URL;

    expect(await profile().saveProfile(INPUT)).toEqual({
      ok: false,
      reason: 'no-web-base-url',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('svarer network når kallet aldri kom fram', async () => {
    mockFetch.mockRejectedValue(new Error('Network request failed'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(await profile().saveProfile(INPUT)).toEqual({
      ok: false,
      reason: 'network',
    });
  });
});
