// native/app/src/data/submitTeam.test.ts
// Native #1918: lagkort-leveringen sett fra appen.
//
// Suiten har ett tyngdepunkt: **at et svar aldri blir til noe annet enn det det
// var.** Leveringen låser kortet for HELE laget og sender varsel til arrangøren,
// og spilleren handler på det appen sier — så en 422 som leses som «det gikk
// fint» sender hen videre i troen på at runden er levert, mens laget fortsatt
// står uten kort. Derfor er hver status-gren låst, hver for seg.
//
// Det som IKKE testes her: vakt-rekkefølgen som sådan (den er `webApi.ts` sin,
// og `account.test.ts` låser den for den andre ruta), regelen om hva en levering
// ER (den bor i `lib/games/submitScorecardCore.ts` og testes der) og hvilke
// setninger kodene betyr (`lib/actionFeedback.test.ts`). Denne fila kjenner bare
// koder.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import { useFreshModules } from '../test/harness';

jest.mock('../supabase', () => require('../test/supabaseMock'));

// Nett-status styres per test. `mock`-prefikset er jests egen regel for
// variabler en `jest.mock`-fabrikk får lov å lukke over.
const mockNetwork = { online: true };
jest.mock('./syncTriggers', () => ({
  isDeviceOnline: () => mockNetwork.online,
}));

const BASE_URL = 'https://staging.example';
const GAME_ID = 'game-1';
const SUBMIT_URL = `${BASE_URL}/api/games/${GAME_ID}/submit-team`;
const TOKEN = 'access-token-abc';

type Mocks = typeof import('../test/supabaseMock');
type SubmitTeam = typeof import('./submitTeam');

const mockFetch = jest.fn();

function submitTeam(): SubmitTeam {
  return require('./submitTeam') as SubmitTeam;
}

function auth(): Mocks['supabase']['auth'] {
  return (require('../test/supabaseMock') as Mocks).supabase.auth;
}

/** Neste svar fra ruta. `json()` speiler ekte `Response` — den kan kaste. */
function respondWith(status: number, body: unknown): void {
  mockFetch.mockResolvedValue({
    status,
    json: async () => body,
  } as unknown as Response);
}

/** Argumentene ruta faktisk ble kalt med. */
function requestInit(): RequestInit {
  return mockFetch.mock.calls[0][1] as RequestInit;
}

describe('lagkort-levering', () => {
  useFreshModules();

  const originalFetch = global.fetch;

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

  it('leverer med POST og Bearer-token, uten kropp og uten query', async () => {
    respondWith(200, { submitted: 2, alreadySubmitted: false });

    expect(await submitTeam().submitTeam(GAME_ID)).toEqual({
      ok: true,
      alreadySubmitted: false,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    // Eksakt URL: spillet identifiseres av STIEN, spilleren av tokenet. Sender
    // appen aldri en id i en kropp eller query, finnes det ingen id å forveksle
    // med en annens.
    expect(mockFetch.mock.calls[0][0]).toBe(SUBMIT_URL);
    const init = requestInit();
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(init.body).toBeUndefined();
  });

  it('er levert selv om svaret ikke sa hvilken vei det gikk', async () => {
    // 200 er kvitteringen; `alreadySubmitted` er informasjon. Mangler feltet,
    // faller det til `false` — å kalle en fullført levering mislykket fordi et
    // ordlyds-felt manglet, forteller spilleren det motsatte av det som skjedde.
    respondWith(200, {});

    expect(await submitTeam().submitTeam(GAME_ID)).toEqual({
      ok: true,
      alreadySubmitted: false,
    });
  });

  it('sier ifra når laget alt sto som levert', async () => {
    // Makkeren rakk det først: UPDATE-en traff 0 rader, og det ER det lovlige
    // utfallet. Fortsatt suksess, bare en annen setning på skjermen.
    respondWith(200, { submitted: 0, alreadySubmitted: true });

    expect(await submitTeam().submitTeam(GAME_ID)).toEqual({
      ok: true,
      alreadySubmitted: true,
    });
  });

  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'not_found'],
    [409, 'not_active'],
    [422, 'withdrawn'],
    [500, 'submit_failed'],
  ])('oversetter %i til %s', async (status, reason) => {
    respondWith(status, { error: reason });

    expect(await submitTeam().submitTeam(GAME_ID)).toEqual({ ok: false, reason });
  });

  it('holder på statusen selv når kroppen er uleselig', async () => {
    // En 409 fra et lag foran appen vår kan være HTML. Statusen er allerede
    // lest, så et uleselig svar skal ikke bli en ANNEN feil enn den sier.
    mockFetch.mockResolvedValue({
      status: 409,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    } as unknown as Response);

    expect(await submitTeam().submitTeam(GAME_ID)).toEqual({
      ok: false,
      reason: 'not_active',
    });
  });

  it('leverer ikke uten nett', async () => {
    mockNetwork.online = false;

    expect(await submitTeam().submitTeam(GAME_ID)).toEqual({
      ok: false,
      reason: 'offline',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sier ifra når server-adressen mangler i bygget', async () => {
    delete process.env.EXPO_PUBLIC_WEB_BASE_URL;

    expect(await submitTeam().submitTeam(GAME_ID)).toEqual({
      ok: false,
      reason: 'no-web-base-url',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sender ikke et kall uten sesjon', async () => {
    auth().getSession.mockResolvedValue({ data: { session: null } });

    expect(await submitTeam().submitTeam(GAME_ID)).toEqual({
      ok: false,
      reason: 'unauthorized',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('svarer network når kallet aldri kom fram', async () => {
    mockFetch.mockRejectedValue(new Error('Network request failed'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(await submitTeam().submitTeam(GAME_ID)).toEqual({
      ok: false,
      reason: 'network',
    });
  });
});
