import { describe, it, expect } from 'vitest';
import { computeSettlement } from './settlement';

describe('computeSettlement — guards', () => {
  it('returnerer null når krPerUnit <= 0', () => {
    expect(
      computeSettlement({
        units: [
          { userId: 'a', units: 2 },
          { userId: 'b', units: 1 },
        ],
        krPerUnit: 0,
        unitLabel: 'skin',
      }),
    ).toBeNull();
    expect(
      computeSettlement({
        units: [
          { userId: 'a', units: 2 },
          { userId: 'b', units: 1 },
        ],
        krPerUnit: -5,
        unitLabel: 'skin',
      }),
    ).toBeNull();
  });

  it('returnerer null med færre enn 2 spillere', () => {
    expect(
      computeSettlement({
        units: [{ userId: 'a', units: 4 }],
        krPerUnit: 100,
        unitLabel: 'skin',
      }),
    ).toBeNull();
    expect(
      computeSettlement({ units: [], krPerUnit: 100, unitLabel: 'skin' }),
    ).toBeNull();
  });
});

describe('computeSettlement — pott-modell (mot feltsnittet)', () => {
  it('eier-eksempel: 200 kr/skin, Per 2 / Ola 1 / Gustav 4', () => {
    const s = computeSettlement({
      units: [
        { userId: 'per', units: 2 },
        { userId: 'ola', units: 1 },
        { userId: 'gustav', units: 4 },
      ],
      krPerUnit: 200,
      unitLabel: 'skin',
    });
    expect(s).not.toBeNull();
    const net = Object.fromEntries(s!.perPlayer.map((p) => [p.userId, p.netKr]));
    expect(net).toEqual({ per: -67, ola: -267, gustav: 334 });
    // sortert på netKr desc
    expect(s!.perPlayer.map((p) => p.userId)).toEqual(['gustav', 'per', 'ola']);
    // payments: grådig min-transaksjoner
    expect(s!.payments).toEqual([
      { fromUserId: 'ola', toUserId: 'gustav', kr: 267 },
      { fromUserId: 'per', toUserId: 'gustav', kr: 67 },
    ]);
    expect(s!.unitLabel).toBe('skin');
    expect(s!.krPerUnit).toBe(200);
  });

  it('netto summerer alltid til 0 (balansert)', () => {
    const cases = [
      [3, 7, 11, 2],
      [0, 0, 5, 5],
      [1, 1, 1],
      [9, 0, 0, 0, 0],
    ];
    for (const units of cases) {
      const s = computeSettlement({
        units: units.map((u, i) => ({ userId: `p${i}`, units: u })),
        krPerUnit: 50,
        unitLabel: 'poeng',
      });
      const sum = s!.perPlayer.reduce((acc, p) => acc + p.netKr, 0);
      expect(sum).toBe(0);
    }
  });

  it('payments summerer til kreditorenes total og er ≤ N−1', () => {
    const s = computeSettlement({
      units: [
        { userId: 'a', units: 6 },
        { userId: 'b', units: 0 },
        { userId: 'c', units: 0 },
        { userId: 'd', units: 0 },
      ],
      krPerUnit: 100,
      unitLabel: 'poeng',
    });
    const credit = s!.perPlayer
      .filter((p) => p.netKr > 0)
      .reduce((acc, p) => acc + p.netKr, 0);
    const paid = s!.payments.reduce((acc, p) => acc + p.kr, 0);
    expect(paid).toBe(credit);
    expect(s!.payments.length).toBeLessThanOrEqual(3);
    expect(s!.payments.every((p) => p.kr > 0)).toBe(true);
  });

  it('alle like → ingen netto, ingen betalinger', () => {
    const s = computeSettlement({
      units: [
        { userId: 'a', units: 3 },
        { userId: 'b', units: 3 },
        { userId: 'c', units: 3 },
      ],
      krPerUnit: 100,
      unitLabel: 'poeng',
    });
    expect(s!.perPlayer.every((p) => p.netKr === 0)).toBe(true);
    expect(s!.payments).toEqual([]);
  });

  it('håndterer negative enheter (Acey-Deucey)', () => {
    const s = computeSettlement({
      units: [
        { userId: 'a', units: 3 },
        { userId: 'b', units: 0 },
        { userId: 'c', units: 0 },
        { userId: 'd', units: -3 },
      ],
      krPerUnit: 100,
      unitLabel: 'poeng',
    });
    const net = Object.fromEntries(s!.perPlayer.map((p) => [p.userId, p.netKr]));
    expect(net).toEqual({ a: 300, b: 0, c: 0, d: -300 });
    expect(s!.payments).toEqual([
      { fromUserId: 'd', toUserId: 'a', kr: 300 },
    ]);
  });
});
