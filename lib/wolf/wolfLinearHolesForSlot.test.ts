import { describe, it, expect } from 'vitest';
import { wolfLinearHolesForSlot } from './wolfLinearHolesForSlot';

/**
 * Type A (ren logikk). Funksjonen er avledet av SAMME formel som motoren
 * (`lib/scoring/modes/wolf.ts` → `determineWolf`), så testen står på to bein:
 * edge-tabellen under, og den siste `it`-en som regner rotasjonen ut fra
 * motorens egen `((hull − 1) % n) + 1` og krever at de to er enige. Driver
 * formelen fra hverandre, faller den siste.
 */
describe('wolfLinearHolesForSlot', () => {
  it.each([
    // klasse            slot  n   forventet
    ['n=3 slot 1 — hele runden er rotasjon (R=18)', 1, 3, [1, 4, 7, 10, 13, 16]],
    ['n=3 slot 3 — den lengste lista (seks hull)', 3, 3, [3, 6, 9, 12, 15, 18]],
    ['n=4 slot 3', 3, 4, [3, 7, 11, 15]],
    ['n=4 slot 4 — hull 17 og 18 er trailing, ikke med', 4, 4, [4, 8, 12, 16]],
    ['n=4 slot 1', 1, 4, [1, 5, 9, 13]],
    ['n=5 slot 5 — R=15', 5, 5, [5, 10, 15]],
    ['n=5 slot 1', 1, 5, [1, 6, 11]],
  ])('%s', (_name, slot, n, expected) => {
    expect(wolfLinearHolesForSlot(slot, n)).toEqual(expected);
  });

  it.each([
    ['tom rotasjon', 1, 0],
    ['slot større enn n (utdatert rad etter at noen falt fra)', 5, 4],
    ['slot 0', 0, 4],
    ['negativ slot', -1, 4],
    ['for få spillere til wolf', 1, 2],
    ['for mange spillere til wolf', 1, 6],
    ['slot er ikke et heltall', 1.5, 4],
    ['n er ikke et heltall', 1, 4.5],
  ])('gir ingen hull ved %s', (_name, slot, n) => {
    expect(wolfLinearHolesForSlot(slot, n)).toEqual([]);
  });

  it('er enig med motorens rotasjonsformel for hver slot i 3–5', () => {
    for (let n = 3; n <= 5; n++) {
      const lastRotationHole = Math.floor(18 / n) * n;
      for (let slot = 1; slot <= n; slot++) {
        const fromEngineFormula: number[] = [];
        for (let hole = 1; hole <= lastRotationHole; hole++) {
          if (((hole - 1) % n) + 1 === slot) fromEngineFormula.push(hole);
        }
        expect(wolfLinearHolesForSlot(slot, n)).toEqual(fromEngineFormula);
      }
    }
  });

  it('deler runden mellom slotene uten overlapp, og lar trailing-hullene ligge', () => {
    const n = 4;
    const all = [1, 2, 3, 4].flatMap((slot) => wolfLinearHolesForSlot(slot, n));
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    ]);
  });
});
