import { describe, it, expect } from 'vitest';
import { toCupMatchGameMode, type CupMatchGameMode } from './cupMatchGameMode';

// Type-A unit-test for oppslagskartet som erstattet ternær-kjeden i
// getCupSnapshot (#1522). Låser at hver kjente modus mappes til SEG SELV (en
// stille feilmapping ville gitt feil navne-stil på matchkortet, #1441 F5), og
// at alt ukjent lander på den typesikre singles-fallbacken.

describe('toCupMatchGameMode — kjente modi mappes til seg selv', () => {
  it.each<CupMatchGameMode>([
    'singles_matchplay',
    'fourball_matchplay',
    'foursomes_matchplay',
    'greensome_matchplay',
    'chapman_matchplay',
    'gruesome_matchplay',
    'best_ball',
  ])('%s', (mode) => {
    expect(toCupMatchGameMode(mode)).toBe(mode);
  });
});

describe('toCupMatchGameMode — ukjent modus faller til singles', () => {
  it.each([
    ['tom streng', ''],
    ['stableford (aldri en cup-kamp)', 'stableford'],
    ['stroke_play', 'stroke_play'],
    ['framtidig modus', 'wolf'],
    ['feil case', 'Best_Ball'],
    ['prototype-forurensning', 'toString'],
  ])('%s → singles_matchplay', (_desc, mode) => {
    expect(toCupMatchGameMode(mode)).toBe('singles_matchplay');
  });
});
