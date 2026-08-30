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

    const { seedGameScores } = require('./seedScores') as typeof import('./seedScores');
    expect(await seedGameScores(GAME)).toBe(3);

    // Bare spillet filtreres på — ingen `.lte('hole_number', …)`, ingen
    // `.eq('user_id', …)`. Flight-synligheten er RLS sin jobb.
    expect(scores.steps.filter((s) => s.method !== 'select')).toEqual([
      { method: 'eq', args: ['game_id', GAME] },
    ]);

    const { getDb, listScoresForGame } = require('./db') as Db;
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
