// Native N3 (#1825): seeden som henter server-scorene inn i den lokale basen.
//
// To ting må holde. (1) Ingen filtrering på hull eller spiller — RLS avgjør hva
// enheten får se, og et ekstra filter her ville skjult rader appen har lov til å
// vise. (2) Hver rad går gjennom `mergeServerScore`, så LWW er fortsatt eneste
// vei inn: en seed kan aldri kaste et slag spilleren nettopp tastet offline.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import { useFreshModules } from '../test/harness';

jest.mock('../supabase', () => require('../test/supabaseMock'));

const GAME = 'game-1';
const ME = 'user-me';
const MATE = 'user-mate';
const FROZEN = '2026-08-30T10:00:00.000Z';

type Mocks = typeof import('../test/supabaseMock');
type Db = typeof import('./db');

function mocks(): Mocks {
  return require('../test/supabaseMock') as Mocks;
}

function serverRow(userId: string, holeNumber: number, strokes: number) {
  return {
    game_id: GAME,
    user_id: userId,
    hole_number: holeNumber,
    strokes,
    putts: null,
    entered_by: userId,
    client_updated_at: '2026-08-30T09:00:00.000Z',
    updated_at: '2026-08-30T09:00:01.000Z',
  };
}

describe('seedGameScores', () => {
  useFreshModules();

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date(FROZEN) });
    mocks().currentDeviceUserId.mockResolvedValue(ME);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('henter alle synlige rader for spillet og merger dem lokalt', async () => {
    const { queryStub, routeFrom } = mocks();
    const scores = queryStub({
      data: [serverRow(ME, 1, 4), serverRow(ME, 18, 5), serverRow(MATE, 1, 6)],
      error: null,
    });
    routeFrom({ scores: [scores] });

    // #2227: hele seeden i ÉN transaksjon, ikke én per rad. Basen åpnes først,
    // så spionen bare teller seedens egne transaksjoner.
    const { getDb } = require('./db') as Db;
    await getDb();
    const { MockSQLiteDatabase } = require('../test/sqliteMock') as typeof import('../test/sqliteMock');
    const txnSpy = jest.spyOn(MockSQLiteDatabase.prototype, 'withExclusiveTransactionAsync');

    const { seedGameScores } = require('./seedScores') as typeof import('./seedScores');
    expect(await seedGameScores(GAME)).toBe(3);
    expect(txnSpy).toHaveBeenCalledTimes(1);
    txnSpy.mockRestore();

    // Bare spillet filtreres på — ingen `.lte('hole_number', …)`, ingen
    // `.eq('user_id', …)`. Flight-synligheten er RLS sin jobb.
    expect(scores.steps.filter((s) => s.method !== 'select')).toEqual([
      { method: 'eq', args: ['game_id', GAME] },
      // #1894: sidevis lesing, én kort side.
      { method: 'order', args: ['id'] },
      { method: 'range', args: [0, 999] },
    ]);

    const { listScoresForGame } = require('./db') as Db;
    const stored = await listScoresForGame(await getDb(), GAME);
    expect(stored).toHaveLength(3);
    expect(stored.map((row) => [row.userId, row.holeNumber, row.strokes])).toEqual(
      // Rekkefølgen mellom to rader på samme hull er ikke en kontrakt.
      expect.arrayContaining([
        [ME, 1, 4],
        [MATE, 1, 6],
        [ME, 18, 5],
      ]),
    );
  });

  it('lar et nyere lokalt slag stå — LWW gjelder også for en seed', async () => {
    const { queryStub, routeFrom } = mocks();
    routeFrom({ scores: [queryStub({ data: [serverRow(ME, 1, 4)], error: null })] });

    // Spilleren tastet 7 i flymodus; server-raden er eldre.
    const { writeScore } = require('./writeScore') as typeof import('./writeScore');
    await writeScore({
      gameId: GAME,
      userId: ME,
      holeNumber: 1,
      strokes: 7,
      enteredBy: ME,
    });

    const { seedGameScores } = require('./seedScores') as typeof import('./seedScores');
    await seedGameScores(GAME);

    const { getDb, getScore, scoreKey } = require('./db') as Db;
    expect(await getScore(await getDb(), scoreKey(GAME, ME, 1))).toMatchObject({
      strokes: 7,
      serverUpdatedAt: null,
    });
  });

  it('kaster videre når lesingen feiler, så kalleren kan si fra', async () => {
    const { queryStub, routeFrom } = mocks();
    routeFrom({
      scores: [queryStub({ data: null, error: { message: 'Network request failed' } })],
    });

    const { seedGameScores } = require('./seedScores') as typeof import('./seedScores');
    await expect(seedGameScores(GAME)).rejects.toThrow('Network request failed');
  });
});

// #2580: utslagene hentes på samme måte, i en egen henting (team_tee_shots er en
// egen tabell, og en routeFrom uten den skal ikke knekke slag-seeden).
describe('seedGameTeeShots (#2580)', () => {
  useFreshModules();

  function teeRow(teamNumber: number, holeNumber: number, teeShotBy: string | null, clientUpdatedAt = '2026-08-30T09:00:00.000Z') {
    return {
      game_id: GAME,
      team_number: teamNumber,
      hole_number: holeNumber,
      tee_shot_by: teeShotBy,
      entered_by: MATE,
      client_updated_at: clientUpdatedAt,
      updated_at: '2026-08-30T09:00:01.000Z',
    };
  }

  it('henter spillets utslag sidevis og merger dem i én transaksjon', async () => {
    const { queryStub, routeFrom } = mocks();
    const shots = queryStub({ data: [teeRow(1, 1, ME), teeRow(1, 2, MATE), teeRow(2, 1, null)], error: null });
    routeFrom({ team_tee_shots: [shots] });

    const { getDb } = require('./db') as Db;
    await getDb();
    const { MockSQLiteDatabase } = require('../test/sqliteMock') as typeof import('../test/sqliteMock');
    const txnSpy = jest.spyOn(MockSQLiteDatabase.prototype, 'withExclusiveTransactionAsync');

    const { seedGameTeeShots } = require('./seedScores') as typeof import('./seedScores');
    expect(await seedGameTeeShots(GAME)).toBe(3);
    expect(txnSpy).toHaveBeenCalledTimes(1);
    txnSpy.mockRestore();

    expect(shots.steps.filter((s) => s.method !== 'select')).toEqual([
      { method: 'eq', args: ['game_id', GAME] },
      { method: 'order', args: ['team_number'] },
      { method: 'order', args: ['hole_number'] },
      { method: 'range', args: [0, 999] },
    ]);
    const { listTeeShotsForGame } = require('./db') as Db;
    expect((await listTeeShotsForGame(await getDb(), GAME)).map((r) => [r.teamNumber, r.holeNumber, r.teeShotBy])).toEqual([
      [1, 1, ME],
      [1, 2, MATE],
      [2, 1, null],
    ]);
  });

  it('kaster ikke bort et valg som venter i køen', async () => {
    const { writeTeeShot } = require('./writeTeeShot') as typeof import('./writeTeeShot');
    await writeTeeShot({ gameId: GAME, teamNumber: 1, holeNumber: 1, teeShotBy: ME, enteredBy: ME });
    const { queryStub, routeFrom } = mocks();
    routeFrom({ team_tee_shots: [queryStub({ data: [teeRow(1, 1, MATE, '2030-01-01T00:00:00.000Z')], error: null })] });

    const { seedGameTeeShots } = require('./seedScores') as typeof import('./seedScores');
    await seedGameTeeShots(GAME);

    const { getDb, getTeeShot } = require('./db') as Db;
    expect((await getTeeShot(await getDb(), `${GAME}:1:1`))?.teeShotBy).toBe(ME);
  });

  it('kaster videre når hentingen feiler, så skjermen kan si fra', async () => {
    const { queryStub, routeFrom } = mocks();
    routeFrom({ team_tee_shots: [queryStub({ data: null, error: { message: 'nett' } })] });

    const { seedGameTeeShots } = require('./seedScores') as typeof import('./seedScores');
    await expect(seedGameTeeShots(GAME)).rejects.toBeTruthy();
  });
});
