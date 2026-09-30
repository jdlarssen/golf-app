import { describe, expect, it } from 'vitest';
import type {
  SoloStrokeplayResult,
  StablefordSoloResult,
} from '@/lib/scoring/modes/types';
import {
  formatSignedPoints,
  soloStablefordScorecard,
  soloStrokeplayScorecard,
} from './soloScorecard';

// #2255: «Hull for hull» for solo stableford og solo slagspill. Regnestykket
// bor her, så webbens visninger og appens skjerm tegner de samme radene.

const PAR_BY_GENDER = { mens: 4, ladies: 5, juniors: 4 };

function stablefordHole(
  holeNumber: number,
  cells: { userId: string; gross: number | null; points: number; par?: number }[],
  bestUserIds: string[],
) {
  return {
    holeNumber,
    par: 4,
    strokeIndex: holeNumber,
    parByGender: PAR_BY_GENDER,
    perPlayer: cells.map((c) => ({ par: 4, ...c })),
    bestUserIds,
  };
}

const STABLEFORD: StablefordSoloResult = {
  kind: 'stableford',
  variant: 'solo',
  players: [
    { userId: 'ola', totalPoints: 7, rank: 1, holesPlayed: 3, tiedWith: [] },
    { userId: 'kari', totalPoints: 4, rank: 2, holesPlayed: 2, tiedWith: [] },
    { userId: 'per', totalPoints: 0, rank: 3, holesPlayed: 0, tiedWith: [] },
  ],
  holes: [
    stablefordHole(
      1,
      [
        { userId: 'kari', gross: 5, points: 2 },
        { userId: 'per', gross: null, points: 0 },
        { userId: 'ola', gross: 4, points: 3 },
      ],
      ['ola'],
    ),
    stablefordHole(
      2,
      [
        { userId: 'ola', gross: 5, points: 2 },
        { userId: 'kari', gross: 5, points: 2 },
        { userId: 'per', gross: null, points: 0 },
      ],
      ['ola', 'kari'],
    ),
    stablefordHole(
      3,
      [
        { userId: 'ola', gross: null, points: 0 },
        { userId: 'kari', gross: null, points: 0 },
        { userId: 'per', gross: null, points: 0 },
      ],
      [],
    ),
    stablefordHole(10, [{ userId: 'ola', gross: 6, points: 2 }], ['ola']),
    // Modifisert stableford kan gi minuspoeng.
    stablefordHole(11, [{ userId: 'ola', gross: 8, points: -3 }], ['ola']),
  ],
};

describe('soloStablefordScorecard', () => {
  const teeOf = () => 'mens';
  const card = soloStablefordScorecard(STABLEFORD, teeOf);

  it('stillingen følger resultatet, og bare en alene på 1. plass leder', () => {
    expect(card.standings.map((s) => [s.userId, s.rank, s.isLeader, s.total, s.holesPlayed])).toEqual([
      ['ola', 1, true, 7, 3],
      ['kari', 2, false, 4, 2],
      ['per', 3, false, 0, 0],
    ]);
    const tied = soloStablefordScorecard(
      {
        ...STABLEFORD,
        players: STABLEFORD.players.map((p) =>
          p.userId === 'ola' ? { ...p, tiedWith: ['kari'] } : p,
        ),
      },
      teeOf,
    );
    expect(tied.standings[0]!.isLeader).toBe(false);
  });

  it('deler hullene i Ut (1–9) og Inn (10–18)', () => {
    expect(card.front.holes.map((h) => h.holeNumber)).toEqual([1, 2, 3]);
    expect(card.back.holes.map((h) => h.holeNumber)).toEqual([10, 11]);
  });

  it('radene: flest poeng først, uspilte sist; verdien er poengene, eller null uspilt', () => {
    const hole1 = card.front.holes[0]!;
    expect(hole1.rows.map((r) => [r.userId, r.value])).toEqual([
      ['ola', 3],
      ['kari', 2],
      ['per', null],
    ]);
  });

  it('hullvinneren er bare én; delt beste gir ingen', () => {
    expect(card.front.holes[0]!.rows.find((r) => r.isBest)?.userId).toBe('ola');
    expect(card.front.holes[1]!.rows.some((r) => r.isBest)).toBe(false);
  });

  it('et hull ingen har spilt, er ikke ført', () => {
    expect(card.front.holes[1]!.scored).toBe(true);
    expect(card.front.holes[2]!.scored).toBe(false);
  });

  it('deltotalen per ni: sum over spilte hull, null uten spilte, høyest leder', () => {
    expect(card.front.subtotals).toEqual([
      { userId: 'ola', sum: 5, isLeader: true },
      { userId: 'kari', sum: 4, isLeader: false },
      { userId: 'per', sum: null, isLeader: false },
    ]);
    // Minuspoeng telles med.
    expect(card.back.subtotals[0]).toEqual({ userId: 'ola', sum: -1, isLeader: true });
  });

  it('par-chippen: eget par når alle går fra samme tee, ellers hullets par', () => {
    expect(card.front.holes[0]!.chipPar).toBe(4);
    const allLadies = soloStablefordScorecard(STABLEFORD, () => 'ladies');
    expect(allLadies.front.holes[0]!.chipPar).toBe(5);
    // Blandet: hullets par (4), ikke den første radens eget par. Ola står
    // først på hullet og går fra dame-tee (5), så testen skiller de to.
    const mixed = soloStablefordScorecard(STABLEFORD, (id) => (id === 'ola' ? 'ladies' : 'mens'));
    expect(mixed.front.holes[0]!.rows[0]!.userId).toBe('ola');
    expect(mixed.front.holes[0]!.chipPar).toBe(4);
  });
});

const STROKEPLAY: SoloStrokeplayResult = {
  kind: 'solo_strokeplay',
  ranking: 'net_total',
  players: [
    { userId: 'kari', totalNetStrokes: 8, totalGrossStrokes: 10, holesPlayed: 2, netToPar: 0, rank: 1, tiedWith: [] },
    { userId: 'ola', totalNetStrokes: 9, totalGrossStrokes: 9, holesPlayed: 2, netToPar: 1, rank: 2, tiedWith: [] },
  ],
  holes: [
    {
      holeNumber: 1,
      par: 4,
      strokeIndex: 1,
      perPlayer: [
        { userId: 'ola', gross: 5, net: 5, par: 4 },
        { userId: 'kari', gross: 5, net: 4, par: 4 },
      ],
      bestUserIds: ['kari'],
    },
    {
      holeNumber: 2,
      par: 4,
      strokeIndex: 2,
      perPlayer: [
        { userId: 'ola', gross: 4, net: 4, par: 4 },
        { userId: 'kari', gross: null, net: null, par: 4 },
      ],
      bestUserIds: ['ola'],
    },
  ],
};

describe('likt på et hull: den som ligger best an i stillingen står først', () => {
  // Webben og appen gir motoren spillerne i hver sin rekkefølge. Uten en egen
  // regel for likhet arvet radene den rekkefølgen, og samme hull så ulikt ut på
  // de to flatene (#2255 PR 3a, side om side på staging).
  it('stableford: samme poeng sorteres etter stillingen, ikke etter rekkefølgen inn', () => {
    const card = soloStablefordScorecard(
      {
        ...STABLEFORD,
        holes: [
          stablefordHole(
            1,
            [
              { userId: 'kari', gross: 5, points: 2 },
              { userId: 'ola', gross: 6, points: 2 },
            ],
            ['kari', 'ola'],
          ),
        ],
      },
      () => 'mens',
    );
    expect(card.front.holes[0]!.rows.map((r) => r.userId)).toEqual(['ola', 'kari']);
  });

  it('to uspilte på samme hull står også etter stillingen', () => {
    const card = soloStablefordScorecard(
      {
        ...STABLEFORD,
        holes: [
          stablefordHole(
            1,
            [
              { userId: 'per', gross: null, points: 0 },
              { userId: 'kari', gross: null, points: 0 },
              { userId: 'ola', gross: 4, points: 3 },
            ],
            ['ola'],
          ),
        ],
      },
      () => 'mens',
    );
    expect(card.front.holes[0]!.rows.map((r) => r.userId)).toEqual(['ola', 'kari', 'per']);
  });

  it('delt plass i stillingen får fast rekkefølge, uansett rekkefølgen inn', () => {
    const tied = (order: string[]) =>
      soloStablefordScorecard(
        {
          ...STABLEFORD,
          players: order.map((userId) => ({ userId, totalPoints: 5, rank: 1, holesPlayed: 1, tiedWith: [] })),
          holes: [],
        },
        () => 'mens',
      ).standings.map((s) => s.userId);
    expect(tied(['per', 'ola', 'kari'])).toEqual(tied(['kari', 'per', 'ola']));
  });

  it('slagspill: samme netto sorteres etter stillingen', () => {
    const card = soloStrokeplayScorecard(
      {
        ...STROKEPLAY,
        holes: [
          {
            holeNumber: 1,
            par: 4,
            strokeIndex: 1,
            perPlayer: [
              { userId: 'ola', gross: 5, net: 4, par: 4 },
              { userId: 'kari', gross: 4, net: 4, par: 4 },
            ],
            bestUserIds: ['ola', 'kari'],
          },
        ],
      } as SoloStrokeplayResult,
      () => 'mens',
    );
    // Kari leder stillingen i STROKEPLAY.
    expect(card.front.holes[0]!.rows.map((r) => r.userId)).toEqual(['kari', 'ola']);
  });
});

describe('soloStrokeplayScorecard', () => {
  const card = soloStrokeplayScorecard(STROKEPLAY, () => 'mens');

  it('stillingen viser netto som total og brutto ved siden av', () => {
    expect(card.standings.map((s) => [s.userId, s.total, s.totalGross, s.isLeader])).toEqual([
      ['kari', 8, 10, true],
      ['ola', 9, 9, false],
    ]);
  });

  it('radene: lavest netto først, uspilte sist; verdien er netto', () => {
    expect(card.front.holes[0]!.rows.map((r) => [r.userId, r.value])).toEqual([
      ['kari', 4],
      ['ola', 5],
    ]);
    expect(card.front.holes[1]!.rows.map((r) => [r.userId, r.value])).toEqual([
      ['ola', 4],
      ['kari', null],
    ]);
  });

  it('deltotalen: lavest netto leder', () => {
    expect(card.front.subtotals).toEqual([
      { userId: 'kari', sum: 4, isLeader: true },
      { userId: 'ola', sum: 9, isLeader: false },
    ]);
  });

  it('uten parByGender er chippen hullets par', () => {
    expect(card.front.holes[0]!.chipPar).toBe(4);
  });
});

describe('formatSignedPoints', () => {
  it('minuspoeng får ekte minustegn (U+2212)', () => {
    expect(formatSignedPoints(-3)).toBe('−3');
    expect(formatSignedPoints(0)).toBe('0');
    expect(formatSignedPoints(4)).toBe('4');
  });
});
