import { describe, it, expect } from 'vitest';

import { averagePctToSumPct, sumPctToAveragePct } from './teamHandicapUnit';

describe('teamHandicapUnit — arrangørens snitt-prosent mot lagret sum-prosent', () => {
  it.each([
    // [snitt-%, lagstørrelse, lagret sum-%]
    [80, 3, 26.67], // «snittet og så 80 %» på et 3-mannslag
    [100, 3, 33.33],
    [66, 3, 22],
    [80, 4, 20],
    [80, 2, 40],
    [45, 3, 15], // dagens NGF-default for 3-mannslag, uttrykt i snitt
    [50, 2, 25], // NGF 2-mann
    [40, 4, 10], // NGF 4-mann
    [0, 3, 0], // brutto
  ])('snitt %i %% på %i-mannslag lagres som %s %% av summen', (avg, size, sum) => {
    expect(averagePctToSumPct(avg, size)).toBe(sum);
  });

  it.each([
    [26.67, 3, 80],
    [15, 3, 45],
    [25, 2, 50],
    [10, 4, 40],
    [12.5, 4, 50], // Ambrose-formelen er alltid halve snittet
    [100 / 6, 3, 50],
    [0, 4, 0],
  ])('lagret %s %% av summen vises som %i %% av snittet på %i-mannslag', (sum, size, avg) => {
    expect(sumPctToAveragePct(sum, size)).toBe(avg);
  });

  it('hvert heltall 0–100 overlever tur–retur for lag à 2, 3 og 4', () => {
    for (const size of [2, 3, 4]) {
      for (let avg = 0; avg <= 100; avg++) {
        expect(sumPctToAveragePct(averagePctToSumPct(avg, size), size)).toBe(avg);
      }
    }
  });

  it('ugyldig input faller til 0 i stedet for NaN', () => {
    expect(averagePctToSumPct(Number.NaN, 3)).toBe(0);
    expect(averagePctToSumPct(80, 0)).toBe(0);
    expect(sumPctToAveragePct(Number.NaN, 3)).toBe(0);
    expect(sumPctToAveragePct(15, 0)).toBe(0);
  });
});
