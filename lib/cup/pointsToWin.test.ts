import { describe, it, expect } from 'vitest';
import { derivePointsToWin, derivePointsToWinWeighted } from './pointsToWin';

// Type A per docs/test-discipline.md — ren regel-logikk (#1142).
describe('derivePointsToWin', () => {
  it.each([
    // [matcher, mål] — halvparten + 0,5
    [2, 1.5],
    [4, 2.5],
    [8, 4.5], // det gamle create-form-defaultet, nå utledet av et ekte antall
    [12, 6.5],
  ])('%i matcher gir målet %f', (matchCount, expected) => {
    expect(derivePointsToWin(matchCount)).toBe(expected);
  });

  it('gir et mål motstanderen ikke kan møte, også ved oddetall matcher', () => {
    // 5 matcher → 3 poeng. Taperen kan maks nå 2 av de 5.
    expect(derivePointsToWin(5)).toBe(3);
    // Beviset regelen finnes for: målet er alltid > halve potten.
    for (const n of [2, 3, 4, 5, 8, 9]) {
      expect(derivePointsToWin(n)).toBeGreaterThan(n / 2);
    }
  });

  it('holder seg over 0 på det minste lovlige antallet (CHECK points_to_win > 0)', () => {
    // startTournament slipper aldri gjennom færre enn 2 matcher, men målet er
    // positivt selv på 0 — DB-CHECK-en kan ikke brytes av denne formelen.
    expect(derivePointsToWin(0)).toBeGreaterThan(0);
  });
});

// #1441 (D8): vektbare cup-poeng (win_points/tie_points). Når arrangøren
// avviker fra 1/0,5-default gir «halvparten av totalen» ikke lenger mening
// som mål (delt match betaler mindre enn seier) — points_to_win blir NULL i
// stedet, akkurat som en cup som ikke har startet ennå (#1142). F3b (ikke
// denne fasen) er ansvarlig for å kalle denne fra startTournament.
describe('derivePointsToWinWeighted', () => {
  it('default-vekter (1/0,5) → delegerer til derivePointsToWin', () => {
    expect(derivePointsToWinWeighted(8, 1, 0.5)).toBe(derivePointsToWin(8));
    expect(derivePointsToWinWeighted(12, 1, 0.5)).toBe(derivePointsToWin(12));
  });

  it('egendefinerte vekter (splittet-cup-dag: seier 5, delt 2) → null', () => {
    expect(derivePointsToWinWeighted(12, 5, 2)).toBeNull();
  });

  it('avvik i KUN win_points → null', () => {
    expect(derivePointsToWinWeighted(8, 2, 0.5)).toBeNull();
  });

  it('avvik i KUN tie_points → null', () => {
    expect(derivePointsToWinWeighted(8, 1, 1)).toBeNull();
  });
});
