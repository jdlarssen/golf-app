// #2254: lesingen bak heltekortet og billetten er best-effort. Hjem har lista
// si fra før, så en feil her skal aldri kaste og aldri tømme noe.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { holeScores, homeBundle, homePlayer } from '../test/homeFixtures';
import {
  fetchCardExtras,
  loadCardBundle,
  loadFinishedRound,
  refreshCardBundle,
  refreshFinishedRound,
} from './homeHero';

jest.mock('./gameBundle', () => ({
  loadGameBundle: jest.fn(),
  refreshGameBundle: jest.fn(),
}));
jest.mock('./seedScores', () => ({ seedGameScores: jest.fn() }));
jest.mock('./choices', () => ({
  fetchWolfChoices: jest.fn(),
  fetchBingoBangoBongoHoles: jest.fn(),
}));
jest.mock('./db', () => ({
  getDb: jest.fn(async () => ({})),
  listScoresForGame: jest.fn(),
  getCacheEntry: jest.fn(),
  putCacheEntry: jest.fn(),
}));

const bundleMod = require('./gameBundle') as {
  loadGameBundle: jest.Mock;
  refreshGameBundle: jest.Mock;
};
const seedMod = require('./seedScores') as { seedGameScores: jest.Mock };
const choicesMod = require('./choices') as {
  fetchWolfChoices: jest.Mock;
  fetchBingoBangoBongoHoles: jest.Mock;
};
const dbMod = require('./db') as {
  listScoresForGame: jest.Mock;
  getCacheEntry: jest.Mock;
  putCacheEntry: jest.Mock;
};

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

describe('fetchCardExtras (Hjem v2, #2385)', () => {
  it('henter valgene bare for wolf og bingo bango bongo', async () => {
    const choice = { holeNumber: 1, wolfUserId: 'me', choice: 'lone', partnerUserId: null };
    choicesMod.fetchWolfChoices.mockResolvedValue([choice]);
    choicesMod.fetchBingoBangoBongoHoles.mockResolvedValue([]);

    expect(await fetchCardExtras('g', 'wolf')).toEqual({ wolfChoices: [choice] });
    expect(await fetchCardExtras('g', 'bingo_bango_bongo')).toEqual({ bingoBangoBongoHoles: [] });
    expect(await fetchCardExtras('g', 'stableford')).toEqual({});
    expect(choicesMod.fetchWolfChoices).toHaveBeenCalledTimes(1);
    expect(choicesMod.fetchBingoBangoBongoHoles).toHaveBeenCalledTimes(1);
  });

  it('gir null når hentingen feiler, aldri en tom liste', async () => {
    // En tom liste ville betydd «ingen valg», og motoren ville regnet poeng av
    // det. `null` lar Hjem beholde valgene fra forrige henting.
    choicesMod.fetchWolfChoices.mockRejectedValue(new Error('offline'));
    expect(await fetchCardExtras('g', 'wolf')).toBeNull();
  });
});

describe('forrige runde hentes komplett én gang (Hjem v2, #2385)', () => {
  const FINISHED = homeBundle({
    game: { id: 'last', status: 'finished' },
    players: [homePlayer({ userId: 'me' })],
  });

  it('henter bundel og alle slag, og merker runden når den er avsluttet', async () => {
    dbMod.getCacheEntry.mockResolvedValue(undefined);
    bundleMod.refreshGameBundle.mockResolvedValue(FINISHED);
    seedMod.seedGameScores.mockResolvedValue(54);

    await refreshFinishedRound('last');
    expect(bundleMod.refreshGameBundle).toHaveBeenCalledWith('last');
    expect(seedMod.seedGameScores).toHaveBeenCalledWith('last');
    expect(dbMod.putCacheEntry).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ key: 'last-round:last' }),
    );
  });

  it('henter ikke igjen når runden alt er merket', async () => {
    dbMod.getCacheEntry.mockResolvedValue({ key: 'last-round:last', payload: '1', fetchedAt: 'x' });
    bundleMod.loadGameBundle.mockResolvedValue(FINISHED);

    await refreshFinishedRound('last');
    expect(bundleMod.refreshGameBundle).not.toHaveBeenCalled();
    expect(seedMod.seedGameScores).not.toHaveBeenCalled();
  });

  it('henter igjen når bundelen i cachen ikke kan leses lenger', async () => {
    // En ny app-versjon med ny `BUNDLE_PAYLOAD_VERSION` leser den gamle
    // bundelen som «ingen cache». Merket alene ville da slått av poengene.
    dbMod.getCacheEntry.mockResolvedValue({ key: 'last-round:last', payload: '1', fetchedAt: 'x' });
    bundleMod.loadGameBundle.mockResolvedValue(undefined);
    bundleMod.refreshGameBundle.mockResolvedValue(FINISHED);
    seedMod.seedGameScores.mockResolvedValue(54);

    await refreshFinishedRound('last');
    expect(bundleMod.refreshGameBundle).toHaveBeenCalledWith('last');
  });

  it('merker ikke en halv henting, eller en runde som ikke er avsluttet', async () => {
    dbMod.getCacheEntry.mockResolvedValue(undefined);
    bundleMod.refreshGameBundle.mockResolvedValue(FINISHED);
    seedMod.seedGameScores.mockRejectedValue(new Error('offline'));
    await expect(refreshFinishedRound('last')).resolves.toBeUndefined();

    seedMod.seedGameScores.mockResolvedValue(54);
    bundleMod.refreshGameBundle.mockResolvedValue(BUNDLE);
    await refreshFinishedRound('last');
    expect(dbMod.putCacheEntry).not.toHaveBeenCalled();
  });

  it('gir runden fra enheten bare når den er hentet komplett', async () => {
    bundleMod.loadGameBundle.mockResolvedValue(FINISHED);
    dbMod.listScoresForGame.mockResolvedValue(SCORES);

    // Uten merket kan slagene på telefonen være bare dine egne.
    dbMod.getCacheEntry.mockResolvedValue(undefined);
    expect(await loadFinishedRound('last')).toBeNull();

    dbMod.getCacheEntry.mockResolvedValue({ key: 'last-round:last', payload: '1', fetchedAt: 'x' });
    expect(await loadFinishedRound('last')).toEqual({ bundle: FINISHED, scores: SCORES });
  });
});
