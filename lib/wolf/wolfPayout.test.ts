import { describe, it, expect } from 'vitest';
import { wolfPayout, wolfStakeForHole } from './wolfPayout';

/**
 * Type A (ren logikk). Tallene Wolf-valget viser (#2313). Motoren
 * (`lib/scoring/modes/wolf.ts` → `buildHoleRow`) har sin egen kopi av regelen;
 * at de to er enige, låses i motorens testfil (`wolf.test.ts`, «enig med
 * wolfPayout»). Denne fila dekker bare hjelperens egen tabell.
 */
describe('wolfPayout', () => {
  it.each([
    // n  stake  partnerEach  lone  blind
    [3, 1, 2, 3, 5],
    [3, 2, 4, 6, 10],
    [3, 3, 6, 9, 15],
    [4, 1, 2, 4, 6],
    [4, 2, 4, 8, 12],
    [4, 3, 6, 12, 18],
    [5, 1, 2, 5, 7],
    [5, 2, 4, 10, 14],
    [5, 3, 6, 15, 21],
  ])('n=%i, innsats %i → partner %i hver, lone %i, blind %i', (n, stake, partnerEach, lone, blind) => {
    expect(wolfPayout(n, stake)).toEqual({ partnerEach, lone, blind });
  });
});

describe('wolfStakeForHole', () => {
  const HOLES = [
    { holeNumber: 1, stake: 1 },
    { holeNumber: 2, stake: 2 },
    { holeNumber: 3, stake: 3 },
  ];

  it('gir innsatsen fra raden med samme hullnummer', () => {
    expect(wolfStakeForHole(HOLES, 2)).toBe(2);
    expect(wolfStakeForHole(HOLES, 3)).toBe(3);
    expect(wolfStakeForHole([{ holeNumber: 7, stake: 2 }], 7)).toBe(2);
  });

  it.each([
    ['hullet finnes ikke i radene', HOLES, 9],
    ['ingen rader', [], 1],
    ['radene mangler (motoren kjørte ikke)', undefined, 1],
  ])('%s → grunninnsatsen 1', (_name, holes, holeNumber) => {
    expect(wolfStakeForHole(holes, holeNumber)).toBe(1);
  });
});
