import { describe, it, expect } from 'vitest';
import { showsNetTotal } from './netTotal';

describe('showsNetTotal (#2829)', () => {
  it('slagspill: NETTO står på kortet', () => {
    expect(showsNetTotal({})).toBe(true);
    expect(showsNetTotal({ axis: 'net' })).toBe(true);
  });

  it('stableford: NETTO står ved siden av POENG, som i designet (#2385)', () => {
    // Formatet er ikke en del av regelen: et stableford-kort på netto-aksen
    // viser NETTO akkurat som slagspill.
    expect(showsNetTotal({ axis: 'net', revealActive: false })).toBe(true);
  });

  it('et kort uten netto: et brutto-ligakort (#2638) er regnet uten handicap', () => {
    expect(showsNetTotal({ axis: 'gross' })).toBe(false);
  });

  it('en blind runde som pågår, skjuler NETTO (#2219)', () => {
    expect(showsNetTotal({ revealActive: true })).toBe(false);
    expect(showsNetTotal({ revealActive: true, axis: 'net' })).toBe(false);
  });
});
