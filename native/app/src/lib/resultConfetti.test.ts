// #2756: når konfettien fyrer. Type A.
import { getCacheEntry, putCacheEntry } from '../data/db';
import { claimConfetti, isNewRound, resetConfettiSession } from './resultConfetti';

jest.mock('../data/db', () => ({
  getDb: jest.fn(async () => ({})),
  getCacheEntry: jest.fn(async () => undefined),
  putCacheEntry: jest.fn(async () => undefined),
}));

const NOW = Date.parse('2026-11-04T18:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const ago = (hours: number) => new Date(NOW - hours * HOUR).toISOString();

beforeEach(() => {
  jest.clearAllMocks();
  resetConfettiSession();
});

describe('isNewRound', () => {
  it('ny runde innenfor to døgn, gammel etter', () => {
    expect(isNewRound(ago(47), NOW)).toBe(true);
    expect(isNewRound(ago(49), NOW)).toBe(false);
  });

  it('uten dato, eller med ulesbar dato, er runden gammel', () => {
    expect(isNewRound(null, NOW)).toBe(false);
    expect(isNewRound('ikke en dato', NOW)).toBe(false);
  });
});

describe('claimConfetti', () => {
  it('første gang: ja, og det huskes på telefonen', async () => {
    await expect(claimConfetti('g1', ago(1), NOW)).resolves.toBe(true);
    expect(putCacheEntry).toHaveBeenCalledTimes(1);
  });

  it('andre gang i samme økt: nei, uten å spørre lageret', async () => {
    await claimConfetti('g1', ago(1), NOW);
    (getCacheEntry as jest.Mock).mockClear();
    await expect(claimConfetti('g1', ago(1), NOW)).resolves.toBe(false);
    expect(getCacheEntry).not.toHaveBeenCalled();
  });

  it('etter en omstart: nei, for lageret husker det', async () => {
    (getCacheEntry as jest.Mock).mockResolvedValueOnce({ key: 'x', payload: '1', fetchedAt: '' });
    await expect(claimConfetti('g1', ago(1), NOW)).resolves.toBe(false);
    expect(putCacheEntry).not.toHaveBeenCalled();
  });

  it('en gammel runde: nei, og ingenting lagres', async () => {
    await expect(claimConfetti('g1', ago(72), NOW)).resolves.toBe(false);
    expect(putCacheEntry).not.toHaveBeenCalled();
  });

  it('et annet spill: ja', async () => {
    await claimConfetti('g1', ago(1), NOW);
    await expect(claimConfetti('g2', ago(1), NOW)).resolves.toBe(true);
  });

  it('feiler lageret, gjelder økta, og det kaster ikke', async () => {
    (getCacheEntry as jest.Mock).mockRejectedValueOnce(new Error('db'));
    await expect(claimConfetti('g1', ago(1), NOW)).resolves.toBe(true);
    await expect(claimConfetti('g1', ago(1), NOW)).resolves.toBe(false);
  });
});
