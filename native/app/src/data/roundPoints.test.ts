// #2265: poengene i dagboka er «Forrige runde»s poeng (Hjem v2), og hentingen
// er best-effort. Type A mot mockene for hentingene.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { holeScores, homeBundle, homePlayer } from '../test/homeFixtures';
import { fetchRoundPoints } from './roundPoints';

jest.mock('./homeHero', () => ({
  refreshFinishedRound: jest.fn(async () => undefined),
  loadFinishedRound: jest.fn(),
  fetchCardExtras: jest.fn(async () => ({})),
}));
jest.mock('../lib/lastRound', () => ({
  ...jest.requireActual('../lib/lastRound'),
  lastRoundPoints: jest.fn(),
}));

const hero = require('./homeHero') as {
  refreshFinishedRound: jest.Mock;
  loadFinishedRound: jest.Mock;
  fetchCardExtras: jest.Mock;
};
const last = require('../lib/lastRound') as { lastRoundPoints: jest.Mock };

const DATA = {
  bundle: homeBundle({ players: [homePlayer({ userId: 'me' })] }),
  scores: holeScores('g1', 'me', 3, 4),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('fetchRoundPoints', () => {
  it('asks nothing for a format that counts strokes', async () => {
    expect(await fetchRoundPoints('g1', 'solo_strokeplay', 'me')).toBeNull();
    expect(hero.refreshFinishedRound).not.toHaveBeenCalled();
  });

  it('fetches the finished round once and counts your points with the board’s engine', async () => {
    hero.loadFinishedRound.mockResolvedValue(DATA);
    hero.fetchCardExtras.mockResolvedValue({ wolfChoices: [] });
    last.lastRoundPoints.mockReturnValue(34);

    expect(await fetchRoundPoints('g1', 'wolf', 'me')).toBe(34);
    expect(hero.refreshFinishedRound).toHaveBeenCalledWith('g1');
    expect(last.lastRoundPoints).toHaveBeenCalledWith(DATA.bundle, DATA.scores, 'me', {
      wolfChoices: [],
    });
  });

  it('gives no points before the round is on the phone in full', async () => {
    hero.loadFinishedRound.mockResolvedValue(null);

    expect(await fetchRoundPoints('g1', 'stableford', 'me')).toBeNull();
    expect(last.lastRoundPoints).not.toHaveBeenCalled();
  });

  it('counts without choices when they could not be fetched, and never throws', async () => {
    hero.loadFinishedRound.mockResolvedValue(DATA);
    hero.fetchCardExtras.mockResolvedValue(null);
    last.lastRoundPoints.mockReturnValue(null);

    expect(await fetchRoundPoints('g1', 'wolf', 'me')).toBeNull();
    expect(last.lastRoundPoints).toHaveBeenCalledWith(DATA.bundle, DATA.scores, 'me', {});

    last.lastRoundPoints.mockImplementation(() => {
      throw new Error('motoren');
    });
    expect(await fetchRoundPoints('g1', 'stableford', 'me')).toBeNull();
  });
});
