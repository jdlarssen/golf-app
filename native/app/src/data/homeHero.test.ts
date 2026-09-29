// #2254: lesingen bak heltekortet og billetten er best-effort. Hjem har lista
// si fra før, så en feil her skal aldri kaste og aldri tømme noe.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { holeScores, homeBundle, homePlayer } from '../test/homeFixtures';
import { loadCardBundle, refreshCardBundle } from './homeHero';

jest.mock('./gameBundle', () => ({
  loadGameBundle: jest.fn(),
  refreshGameBundle: jest.fn(),
}));
jest.mock('./seedScores', () => ({ seedGameScores: jest.fn() }));
jest.mock('./db', () => ({
  getDb: jest.fn(async () => ({})),
  listScoresForGame: jest.fn(),
}));

const bundleMod = require('./gameBundle') as {
  loadGameBundle: jest.Mock;
  refreshGameBundle: jest.Mock;
};
const seedMod = require('./seedScores') as { seedGameScores: jest.Mock };
const dbMod = require('./db') as { listScoresForGame: jest.Mock };

const BUNDLE = homeBundle({ players: [homePlayer({ userId: 'me' })] });
const SCORES = holeScores('g-live', 'me', 3, 4);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('loadCardBundle', () => {
  it('gir bundelen og slagene fra enheten', async () => {
    bundleMod.loadGameBundle.mockResolvedValue(BUNDLE);
    dbMod.listScoresForGame.mockResolvedValue(SCORES);

    expect(await loadCardBundle('g-live')).toEqual({ bundle: BUNDLE, scores: SCORES });
    expect(dbMod.listScoresForGame).toHaveBeenCalledWith({}, 'g-live');
  });

  it('gir null uten bundel i cachen, og når lesingen feiler', async () => {
    bundleMod.loadGameBundle.mockResolvedValue(undefined);
    expect(await loadCardBundle('g-live')).toBeNull();

    bundleMod.loadGameBundle.mockRejectedValue(new Error('sqlite'));
    expect(await loadCardBundle('g-live')).toBeNull();
  });
});

describe('refreshCardBundle', () => {
  it('henter slagene bare for heltekortet', async () => {
    bundleMod.refreshGameBundle.mockResolvedValue(BUNDLE);
    seedMod.seedGameScores.mockResolvedValue(3);

    await refreshCardBundle('ticket');
    expect(bundleMod.refreshGameBundle).toHaveBeenCalledWith('ticket');
    expect(seedMod.seedGameScores).not.toHaveBeenCalled();

    await refreshCardBundle('hero', { withScores: true });
    expect(seedMod.seedGameScores).toHaveBeenCalledWith('hero');
  });

  it('kaster ikke når nettet svikter', async () => {
    bundleMod.refreshGameBundle.mockRejectedValue(new Error('offline'));
    seedMod.seedGameScores.mockRejectedValue(new Error('offline'));

    await expect(refreshCardBundle('hero', { withScores: true })).resolves.toBeUndefined();
  });
});
