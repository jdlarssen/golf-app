import { describe, it, expect } from 'vitest';
import {
  computeSettlement,
  settlementForResult,
  settlementUnitKeyFor,
  type SettlementUnitKey,
} from './settlement';
import { MODE_LABELS, type GameMode, type ModeResult } from './modes/types';

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

// #2221: regelen for HVILKE formater som gjør opp i penger, og i hvilken enhet,
// har ett hjem. Nettsidens seks adaptere, begge opprett-veiviserne og appens
// resultatskjerm leser den herfra.
const EXPECTED_UNIT: Record<GameMode, SettlementUnitKey | null> = {
  best_ball: null,
  stableford: null,
  modified_stableford: null,
  singles_matchplay: null,
  solo_strokeplay: null,
  texas_scramble: null,
  ambrose: null,
  florida_scramble: null,
  fourball_matchplay: null,
  foursomes_matchplay: null,
  greensome_matchplay: null,
  chapman_matchplay: null,
  wolf: 'poeng',
  nassau: 'seksjon',
  skins: 'skin',
  bingo_bango_bongo: 'poeng',
  nines: 'poeng',
  round_robin: null,
  acey_deucey: 'poeng',
  shamble: null,
  patsome: null,
  gruesome_matchplay: null,
};

describe('settlementUnitKeyFor', () => {
  it.each(Object.keys(MODE_LABELS) as GameMode[])('%s', (mode) => {
    expect(settlementUnitKeyFor(mode)).toBe(EXPECTED_UNIT[mode]);
  });

  it('kjenner ikke igjen en ukjent slug eller en prototype-nøkkel', () => {
    expect(settlementUnitKeyFor('')).toBeNull();
    expect(settlementUnitKeyFor('toString')).toBeNull();
  });
});

// To spillere: riktig felt gir a = 3, b = 1. Lokkefeltet har andre verdier
// (a = 0, b = 5), så en adapter som leser feil felt gir et annet oppgjør.
const SETTLEMENT_FIXTURES: [string, SettlementUnitKey, ModeResult][] = [
  [
    'skins',
    'skin',
    {
      kind: 'skins',
      players: [
        { userId: 'a', totalSkins: 3, holesWon: 0 },
        { userId: 'b', totalSkins: 1, holesWon: 5 },
      ],
    } as unknown as ModeResult,
  ],
  [
    'wolf',
    'poeng',
    {
      kind: 'wolf',
      players: [
        { userId: 'a', totalPoints: 3, wolfHolesPlayed: 0 },
        { userId: 'b', totalPoints: 1, wolfHolesPlayed: 5 },
      ],
    } as unknown as ModeResult,
  ],
  [
    'bingo_bango_bongo',
    'poeng',
    {
      kind: 'bingo_bango_bongo',
      players: [
        { userId: 'a', totalPoints: 3, bingos: 0 },
        { userId: 'b', totalPoints: 1, bingos: 5 },
      ],
    } as unknown as ModeResult,
  ],
  [
    'nines',
    'poeng',
    {
      kind: 'nines',
      players: [
        { userId: 'a', totalPoints: 3, holesScored: 0 },
        { userId: 'b', totalPoints: 1, holesScored: 5 },
      ],
    } as unknown as ModeResult,
  ],
  [
    'acey_deucey',
    'poeng',
    {
      kind: 'acey_deucey',
      players: [
        { userId: 'a', total: 3, aces: 0 },
        { userId: 'b', total: 1, aces: 5 },
      ],
    } as unknown as ModeResult,
  ],
  [
    'nassau',
    'seksjon',
    {
      kind: 'nassau',
      players: [
        { userId: 'a', units: 3, total18EffectiveStrokes: 0 },
        { userId: 'b', units: 1, total18EffectiveStrokes: 5 },
      ],
    } as unknown as ModeResult,
  ],
];

const label = (unit: SettlementUnitKey) => `label:${unit}`;

describe('settlementForResult', () => {
  it.each(SETTLEMENT_FIXTURES)('%s leser riktig enhetsfelt og enhetsord', (_mode, unit, result) => {
    const s = settlementForResult(result, { kr_per_unit: 100 }, label);
    expect(s).not.toBeNull();
    expect(s!.perPlayer.map((p) => [p.userId, p.units])).toEqual([
      ['a', 3],
      ['b', 1],
    ]);
    expect(s!.perPlayer.map((p) => p.netKr)).toEqual([100, -100]);
    expect(s!.unitLabel).toBe(`label:${unit}`);
    expect(s!.krPerUnit).toBe(100);
  });

  const skinsResult = SETTLEMENT_FIXTURES[0][2];

  it.each([
    ['kr_per_unit mangler', { kind: 'skins' }],
    ['kr_per_unit er 0', { kr_per_unit: 0 }],
    ['kr_per_unit er en streng', { kr_per_unit: '50' }],
    ['kr_per_unit er NaN', { kr_per_unit: Number.NaN }],
    ['kr_per_unit er uendelig', { kr_per_unit: Number.POSITIVE_INFINITY }],
    ['modeConfig er null', null],
    ['modeConfig er undefined', undefined],
    ['modeConfig er et tall', 42],
  ])('null når %s', (_case, modeConfig) => {
    expect(settlementForResult(skinsResult, modeConfig, label)).toBeNull();
  });

  it('null for et format uten oppgjør, selv med kr_per_unit satt', () => {
    const stableford = {
      kind: 'stableford',
      variant: 'solo',
      players: [
        { userId: 'a', totalPoints: 3 },
        { userId: 'b', totalPoints: 1 },
      ],
    } as unknown as ModeResult;
    expect(settlementForResult(stableford, { kr_per_unit: 50 }, label)).toBeNull();
  });
});
