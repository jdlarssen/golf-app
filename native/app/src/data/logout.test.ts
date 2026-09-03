// native/app/src/data/logout.test.ts
// Native #1877: utloggingen sett fra datalaget.
//
// Suiten har to tyngdepunkter, og de trekker i hver sin retning:
//
//  1. **Ingenting skal ligge igjen** til neste bruker av telefonen. Rekkefølgen
//     signOut → wipe asserteres som REKKEFØLGE via en delt kall-logg; «begge ble
//     kalt» ville vært grønt også med wipen først, og da kunne en drain som
//     fortsatt puster rukket å skrive nye rader inn etterpå.
//  2. **Ingen slag skal forsvinne.** Hver gren der køen ikke er tom har negativt
//     bevis: ingen signOut, ingen wipe, raden fortsatt i basen. Det er den ene
//     feilen som ikke kan rettes opp etterpå.
//
// Drainen er EKTE her (`syncWorker`, mot ekte sqlite): det er samspillet mellom
// køen, drainen og porten som avgjør utfallet, og en drain-mock ville bare
// bevist at mocken er enig med seg selv. Bare `supabase.rpc` og
// `supabase.auth` er rigget.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import { useFreshModules } from '../test/harness';

jest.mock('../supabase', () => require('../test/supabaseMock'));

// Kall-loggen er rekkefølge-beviset. Wipen skriver seg inn her (og gjør
// deretter den ekte jobben mot basen), signOut-stubben gjør det samme — en
// snudd rekkefølge blir rød. `mock`-prefikset er jests regel for variabler en
// `jest.mock`-fabrikk får lukke over.
const mockCalls: string[] = [];
jest.mock('./db', () => {
  const actual = jest.requireActual('./db') as typeof import('./db');
  return {
    ...actual,
    wipeLocalData: jest.fn(async () => {
      mockCalls.push('wipe');
      await actual.wipeLocalData();
    }),
  };
});

const GAME = 'game-1';
const ME = 'user-me';
const SERVER_TIME = '2026-08-30T10:00:09.000Z';

type Mocks = typeof import('../test/supabaseMock');
type Db = typeof import('./db');
type Logout = typeof import('./logout');

function mocks(): Mocks {
  return require('../test/supabaseMock') as Mocks;
}

function logout(): Logout {
  return require('./logout') as Logout;
}

function db(): Db {
  return require('./db') as Db;
}

function wipeMock(): jest.Mock {
  return (require('./db') as { wipeLocalData: jest.Mock }).wipeLocalData;
}

/** Ett tastet slag: score-rad + kø-rad, i én transaksjon (som på enheten). */
async function typeStroke(strokes: number): Promise<void> {
  const { writeScore } = require('./writeScore') as typeof import('./writeScore');
  await writeScore({ gameId: GAME, userId: ME, holeNumber: 1, strokes, enteredBy: ME });
}

/** Svaret RPC-en gir når serveren faktisk skrev raden. */
function appliedRow() {
  return {
    data: [
      {
        game_id: GAME,
        user_id: ME,
        hole_number: 1,
        strokes: 4,
        putts: null,
        entered_by: ME,
        client_updated_at: SERVER_TIME,
        updated_at: SERVER_TIME,
        was_applied: true,
      },
    ],
    error: null,
  };
}

/** Et løfte testen selv bestemmer når (og om) skal svare. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function queueLength(): Promise<number> {
  const { getDb, listQueue } = db();
  return (await listQueue(await getDb())).length;
}

describe('logOut', () => {
  useFreshModules();

  beforeEach(() => {
    mockCalls.length = 0;
    const { currentDeviceUserId, supabase } = mocks();
    currentDeviceUserId.mockResolvedValue(ME);
    supabase.auth.signOut.mockImplementation(async () => {
      mockCalls.push('signOut');
      return { error: null };
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('logger ut og tømmer basen når køen er tom', async () => {
    // En ferdig synket runde: score-rad uten kø-element. Akkurat det som ellers
    // ville ligget igjen til neste spiller på telefonen.
    const { getDb, putScore, getScore, scoreKey } = db();
    await putScore(await getDb(), {
      id: scoreKey(GAME, ME, 1),
      gameId: GAME,
      userId: ME,
      holeNumber: 1,
      strokes: 4,
      putts: 2,
      enteredBy: ME,
      clientUpdatedAt: '2026-08-30T09:00:00.000Z',
      serverUpdatedAt: SERVER_TIME,
    });

    expect(await logout().logOut()).toEqual({ ok: true });

    // Sesjonen dør FØR basen røres — motsatt av `deleteAccount`, med vilje.
    expect(mockCalls).toEqual(['signOut', 'wipe']);
    expect(await getScore(await getDb(), scoreKey(GAME, ME, 1))).toBeUndefined();
    // Tom kø → ingen grunn til å ringe serveren i det hele tatt.
    expect(mocks().supabase.rpc).not.toHaveBeenCalled();
  });

  it('nekter å logge ut når et slag ikke kom fram', async () => {
    const { supabase } = mocks();
    // Offline-formen: transient feil, så drainen prøver videre og køen består.
    supabase.rpc.mockResolvedValue({
      data: null,
      error: { message: 'Network request failed' },
    });
    await typeStroke(4);

    expect(await logout().logOut()).toEqual({
      ok: false,
      reason: 'unsent',
      pending: 1,
    });

    // Ingenting har skjedd: spilleren kan avbryte og står nøyaktig der hen sto.
    expect(mockCalls).toEqual([]);
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
    const { getDb, getScore, scoreKey } = db();
    expect(await queueLength()).toBe(1);
    expect(await getScore(await getDb(), scoreKey(GAME, ME, 1))).toMatchObject({
      strokes: 4,
    });
  });

  it('lar det uleverte slaget ligge når spilleren logger ut likevel', async () => {
    const { supabase } = mocks();
    supabase.rpc.mockResolvedValue({
      data: null,
      error: { message: 'Network request failed' },
    });
    await typeStroke(4);

    expect(await logout().logOut({ keepUnsent: true })).toEqual({ ok: true });

    // Utlogget, men INGEN wipe: raden blir liggende på enheten. (Den «går opp
    // ved neste innlogging» kun hvis det er samme bruker og raden ikke er
    // karantenert — derfor lover copyen bare at den blir liggende.)
    expect(mockCalls).toEqual(['signOut']);
    expect(wipeMock()).not.toHaveBeenCalled();
    const { getDb, getScore, scoreKey } = db();
    expect(await queueLength()).toBe(1);
    expect(await getScore(await getDb(), scoreKey(GAME, ME, 1))).toMatchObject({
      strokes: 4,
    });
  });

  it('beholder alt når en annen drain alt er i gang', async () => {
    const { supabase } = mocks();
    const hangingRpc = deferred<unknown>();
    supabase.rpc.mockReturnValue(hangingRpc.promise);
    await typeStroke(4);

    // Intervall-drainen (eller app-i-forgrunnen) har akkurat startet.
    // `inFlight` settes synkront, så vår drain returnerer med én gang.
    const { drainQueue } = require('./syncWorker') as typeof import('./syncWorker');
    const alreadyDraining = drainQueue('intervall');

    // Falske timere UTEN å skru dem fram: skulle `logOut` likevel ha ventet på
    // drainen, ville tidsavbruddet aldri fyrt og testen hengt seg. Det er
    // nettopp `inFlight`-vakten som gjør at vi kommer fram uten en eneste timer.
    jest.useFakeTimers();

    expect(await logout().logOut()).toEqual({
      ok: false,
      reason: 'unsent',
      pending: 1,
    });
    expect(mockCalls).toEqual([]);
    expect(await queueLength()).toBe(1);

    hangingRpc.resolve({ data: null, error: null });
    await alreadyDraining;
  });

  it('tømmer basen når drainen fikk køen tom', async () => {
    const { supabase } = mocks();
    supabase.rpc.mockResolvedValue(appliedRow());
    await typeStroke(4);

    expect(await logout().logOut()).toEqual({ ok: true });

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(mockCalls).toEqual(['signOut', 'wipe']);
    const { getDb, getScore, scoreKey } = db();
    expect(await queueLength()).toBe(0);
    expect(await getScore(await getDb(), scoreKey(GAME, ME, 1))).toBeUndefined();
  });

  it('teller en karantene-rad som et slag som ikke kom fram', async () => {
    // #668: raden ga opp etter fem permanente feil og prøver aldri igjen. For
    // spilleren er det likevel et slag som ikke nådde fram, og det skal stoppe
    // utloggingen like godt som et som fortsatt prøver.
    const { getDb, putQueueItem, scoreKey } = db();
    await putQueueItem(await getDb(), {
      id: scoreKey(GAME, ME, 1),
      scoreId: scoreKey(GAME, ME, 1),
      attemptCount: 5,
      lastError: 'new row violates row-level security policy',
      createdAt: '2026-08-30T09:00:00.000Z',
      abandonedAt: '2026-08-30T09:00:05.000Z',
    });

    expect(await logout().logOut()).toEqual({
      ok: false,
      reason: 'unsent',
      pending: 1,
    });

    expect(mockCalls).toEqual([]);
    // Drainen hoppet over den, som den skal — men den teller likevel.
    expect(mocks().supabase.rpc).not.toHaveBeenCalled();
    expect(await queueLength()).toBe(1);
  });

  // De to neste testene er samme returverdi fra auth-js — `{ error }` — med
  // motsatt utfall, og det er hele poenget. `signOut()` sier ikke om den lokale
  // sesjonen ble borte; `SIGNED_OUT` gjør. Uten det skillet ville den nederste
  // grenen tømt basen for en spiller som fortsatt er innlogget.

  it('logger ut når signOut feiler ETTER at sesjonen ble ryddet', async () => {
    const { supabase, emitAuthEvent } = mocks();
    // Den vanlige offline-utloggingen: tokenet er gyldig, men serveren svarer
    // ikke. auth-js fjerner sesjonen (og varsler abonnentene) FØR den
    // returnerer feilen. Spilleren ER logget ut, så basen skal tømmes.
    supabase.auth.signOut.mockImplementation(async () => {
      mockCalls.push('signOut');
      emitAuthEvent('SIGNED_OUT');
      return { error: { message: 'nettverket falt ut' } };
    });
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(await logout().logOut()).toEqual({ ok: true });

    expect(mockCalls).toEqual(['signOut', 'wipe']);
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });

  it('rører ingenting når signOut feiler og sesjonen BLIR STÅENDE', async () => {
    const { supabase } = mocks();
    // Grenen som gjorde dette til en blocker: access-tokenet er utløpt (over en
    // time offline — en runde uten dekning) og refresh-forsøket feiler med en
    // nettverksfeil. auth-js hopper da over `_removeSession`, `__loadSession`
    // svarer `{ session: null, error }`, og `_signOut` returnerer feilen FØR
    // den rydder. Sesjonen ligger fortsatt i AsyncStorage — ingen `SIGNED_OUT`.
    supabase.auth.signOut.mockImplementation(async () => {
      mockCalls.push('signOut');
      return { error: { message: 'Auth session missing or expired' } };
    });
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});

    // En ferdig synket score-rad: nettopp det en wipe ville tatt.
    const { getDb, putScore, getScore, scoreKey } = db();
    await putScore(await getDb(), {
      id: scoreKey(GAME, ME, 1),
      gameId: GAME,
      userId: ME,
      holeNumber: 1,
      strokes: 4,
      putts: 2,
      enteredBy: ME,
      clientUpdatedAt: '2026-08-30T09:00:00.000Z',
      serverUpdatedAt: SERVER_TIME,
    });

    expect(await logout().logOut()).toEqual({
      ok: false,
      reason: 'signout-failed',
    });

    // Ingen wipe. Spilleren er fortsatt innlogget, og dataene er hens.
    expect(mockCalls).toEqual(['signOut']);
    expect(wipeMock()).not.toHaveBeenCalled();
    expect(await getScore(await getDb(), scoreKey(GAME, ME, 1))).toMatchObject({
      strokes: 4,
    });
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });

  it('beholder de uleverte slagene når «logg ut likevel» ikke fikk sesjonen død', async () => {
    const { supabase } = mocks();
    supabase.rpc.mockResolvedValue({
      data: null,
      error: { message: 'Network request failed' },
    });
    supabase.auth.signOut.mockImplementation(async () => {
      mockCalls.push('signOut');
      return { error: { message: 'Auth session missing or expired' } };
    });
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    await typeStroke(4);

    // `keepUnsent` hopper over `unsent`-porten, men ikke over sesjons-sjekken:
    // svarer vi `ok` her, tror skjermen spilleren er logget ut mens hen ikke er
    // det — og raden blir stående på «Logger ut …» for godt.
    expect(await logout().logOut({ keepUnsent: true })).toEqual({
      ok: false,
      reason: 'signout-failed',
    });

    expect(wipeMock()).not.toHaveBeenCalled();
    expect(await queueLength()).toBe(1);
    errors.mockRestore();
  });

  it('logger ut selv om wipen feiler', async () => {
    wipeMock().mockImplementationOnce(async () => {
      mockCalls.push('wipe');
      throw new Error('disken svarte ikke');
    });
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});

    // Sesjonen er alt borte; å sende spilleren tilbake til en skjerm hen ikke
    // lenger er innlogget på ville vært verre enn en base som ikke ble tømt.
    expect(await logout().logOut()).toEqual({ ok: true });

    expect(mockCalls).toEqual(['signOut', 'wipe']);
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });

  it('gir opp drainen etter tidsavbruddet i stedet for å henge', async () => {
    const { supabase } = mocks();
    const hangingRpc = deferred<unknown>();
    supabase.rpc.mockReturnValue(hangingRpc.promise);
    await typeStroke(4);

    jest.useFakeTimers();
    const { LOGOUT_DRAIN_TIMEOUT_MS, logOut } = logout();
    const pending = logOut();
    // Alt datalaget gjør er mikrotasks; timeren er det eneste som må fyres.
    await jest.advanceTimersByTimeAsync(LOGOUT_DRAIN_TIMEOUT_MS);

    expect(await pending).toEqual({ ok: false, reason: 'unsent', pending: 1 });
    // Tidsavbrudd er alltid trygt: køen ser fortsatt ikke-tom ut, og vi beholder.
    expect(mockCalls).toEqual([]);

    hangingRpc.resolve({ data: null, error: null });
  });
});
