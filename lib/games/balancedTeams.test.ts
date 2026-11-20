import { describe, it, expect } from 'vitest';
import { balancedTeams, teamHcpValues, type BalancePlayer } from './balancedTeams';

// Type A (#2478): «Jevne lag» deals the players by handicap index in a snake —
// the best with the weakest for pairs — and the cards show each team's sum, or
// its average when the teams differ in size.

function players(indexes: (number | null)[], prefix = 'p'): BalancePlayer[] {
  return indexes.map((hcpIndex, i) => ({ id: `${prefix}${i + 1}`, name: `Spiller ${i + 1}`, hcpIndex }));
}

/** The players' ids per team, team 1 first, in the order they were dealt. */
function rosters(teamOf: Record<string, number>, all: BalancePlayer[], teams: number): string[][] {
  return Array.from({ length: teams }, (_, t) =>
    all.filter((p) => teamOf[p.id] === t + 1).map((p) => p.id),
  );
}

// The artboard's eight players (`Nyttspill-forslag-jevne-lag-lys`), out of order.
const ARTBOARD: BalancePlayer[] = [
  { id: 'kari', name: 'Kari Lund', hcpIndex: 15.8 },
  { id: 'anders', name: 'Anders Moe', hcpIndex: 26.0 },
  { id: 'ida', name: 'Ida Moen', hcpIndex: 4.2 },
  { id: 'marte', name: 'Marte Lien', hcpIndex: 18.4 },
  { id: 'jonas', name: 'Jonas Berg', hcpIndex: 9.4 },
  { id: 'tone', name: 'Tone Vik', hcpIndex: 24.3 },
  { id: 'sondre', name: 'Sondre Aas', hcpIndex: 12.1 },
  { id: 'eirik', name: 'Eirik Dahl', hcpIndex: 21.0 },
];

describe('balancedTeams — den beste med den svakeste (#2478)', () => {
  it('tegningens åtte spillere à 2: summene 30,2 · 33,7 · 33,1 · 34,2, og det skiller 4,0', () => {
    const result = balancedTeams(ARTBOARD, [2, 2, 2, 2]);
    expect(rosters(result.teamOf, ARTBOARD, 4).map((ids) => ids.sort())).toEqual([
      ['anders', 'ida'],
      ['jonas', 'tone'],
      ['eirik', 'sondre'],
      ['kari', 'marte'],
    ]);
    expect(result.mode).toBe('sum');
    expect(result.values.map((v) => Number(v?.toFixed(1)))).toEqual([30.2, 33.7, 33.1, 34.2]);
    expect(result.spread).toBeCloseTo(4.0, 9);
    expect(result.uncounted).toEqual([]);
  });

  it('fire spillere i [2, 2] (lag-matchplay): beste og svakeste på side 1, de to i midten på side 2', () => {
    const four = players([20, 5, 30, 10]);
    const { teamOf } = balancedTeams(four, [2, 2]);
    expect(teamOf).toEqual({ p2: 1, p3: 1, p4: 2, p1: 2 });
  });

  it.each([
    [6, [[1, 6], [2, 5], [3, 4]]],
    [12, [[1, 12], [2, 11], [3, 10], [4, 9], [5, 8], [6, 7]]],
  ] as const)('%i spillere à 2 (patsome): n/2 lag etter slangen', (n, expected) => {
    // Index i + 1 for player i + 1, so player k is the k-th best.
    const all = players(Array.from({ length: n }, (_, i) => i + 1));
    const { teamOf } = balancedTeams(all, Array(n / 2).fill(2));
    expect(rosters(teamOf, all, n / 2)).toEqual(expected.map((pair) => pair.map((k) => `p${k}`)));
  });

  it.each([
    // 9 à 3: 1 2 3 | 6 5 4 | 7 8 9
    [[3, 3, 3], [[1, 6, 7], [2, 5, 8], [3, 4, 9]]],
    // 8 à 4: 1 2 | 4 3 | 5 6 | 8 7
    [[4, 4], [[1, 4, 5, 8], [2, 3, 6, 7]]],
    // 16 à 4: 1 2 3 4 | 8 7 6 5 | 9 10 11 12 | 16 15 14 13
    [
      [4, 4, 4, 4],
      [
        [1, 8, 9, 16],
        [2, 7, 10, 15],
        [3, 6, 11, 14],
        [4, 5, 12, 13],
      ],
    ],
  ] as const)('lag på %j fordeles med slangen', (sizes, expected) => {
    const n = sizes.reduce((a, b) => a + b, 0);
    const all = players(Array.from({ length: n }, (_, i) => i + 1));
    const { teamOf, mode } = balancedTeams(all, [...sizes]);
    expect(rosters(teamOf, all, sizes.length)).toEqual(expected.map((team) => team.map((k) => `p${k}`)));
    expect(mode).toBe('sum');
  });

  it('11 spillere à 4 (4/4/3): fullt lag hoppes over i slangen, og kortene viser snitt', () => {
    const all = players(Array.from({ length: 11 }, (_, i) => 2 * (i + 1)));
    const result = balancedTeams(all, [4, 4, 3]);
    // 2 4 6 | 8 10 12 (baklengs) | 14 16 18 | lag 3 er fullt, så 20 22 baklengs.
    expect(rosters(result.teamOf, all, 3)).toEqual([
      ['p1', 'p6', 'p7', 'p11'],
      ['p2', 'p5', 'p8', 'p10'],
      ['p3', 'p4', 'p9'],
    ]);
    expect(result.mode).toBe('average');
    expect(result.values[0]).toBeCloseTo(12.5, 9);
    expect(result.values[1]).toBeCloseTo(12.5, 9);
    expect(result.values[2]).toBeCloseTo(32 / 3, 9);
    expect(result.spread).toBeCloseTo(12.5 - 32 / 3, 9);
    expect(result.spread?.toFixed(1)).toBe('1.8');
  });

  it('lik indeks avgjøres på navn og så id, uansett rekkefølge inn', () => {
    const tied: BalancePlayer[] = [
      { id: 'b', name: 'Ola', hcpIndex: 10 },
      { id: 'a', name: 'Ola', hcpIndex: 10 },
      { id: 'c', name: 'Anne', hcpIndex: 10 },
      { id: 'd', name: 'Per', hcpIndex: 30 },
    ];
    const forward = balancedTeams(tied, [2, 2]);
    const reversed = balancedTeams([...tied].reverse(), [2, 2]);
    // Anne, Ola (a), Ola (b), Per: Anne + Per, Ola a + Ola b.
    expect(forward.teamOf).toEqual({ c: 1, d: 1, a: 2, b: 2 });
    expect(reversed.teamOf).toEqual(forward.teamOf);
  });

  it('samme spillere gir samme lag hver gang', () => {
    expect(balancedTeams(ARTBOARD, [2, 2, 2, 2])).toEqual(balancedTeams(ARTBOARD, [2, 2, 2, 2]));
  });

  it('pluss-handicap (negativ indeks) er best og sorteres først', () => {
    const all: BalancePlayer[] = [
      { id: 'scratch', name: 'A', hcpIndex: 0 },
      { id: 'plus', name: 'B', hcpIndex: -2.1 },
      { id: 'mid', name: 'C', hcpIndex: 12 },
      { id: 'high', name: 'D', hcpIndex: 30 },
    ];
    const { teamOf, values } = balancedTeams(all, [2, 2]);
    expect(teamOf).toEqual({ plus: 1, high: 1, scratch: 2, mid: 2 });
    expect(values[0]).toBeCloseTo(27.9, 9);
  });

  it('spillere uten indeks fordeles til slutt på laget med lavest verdi og står i uncounted', () => {
    // 5 og 25 deles først (slangen over de to regnede); de to uten indeks går
    // til laget med lavest sum som har plass.
    const all: BalancePlayer[] = [
      { id: 'u1', name: 'Ukjent 1', hcpIndex: null },
      { id: 'a', name: 'A', hcpIndex: 5 },
      { id: 'b', name: 'B', hcpIndex: 25 },
      { id: 'u2', name: 'Ukjent 2', hcpIndex: null },
    ];
    const result = balancedTeams(all, [2, 2]);
    expect(result.teamOf).toEqual({ a: 1, b: 2, u1: 1, u2: 2 });
    // Both teams have a player without an index, so neither has a sum.
    expect(result.values).toEqual([null, null]);
    expect(result.spread).toBeNull();
    expect(result.uncounted).toEqual(['u1', 'u2']);
  });

  it('flere uten indeks går til det laveste laget så lenge det har plass', () => {
    const all: BalancePlayer[] = [
      { id: 'a', name: 'A', hcpIndex: 10 },
      { id: 'b', name: 'B', hcpIndex: 20 },
      { id: 'c', name: 'C', hcpIndex: 30 },
      { id: 'u1', name: 'U1', hcpIndex: null },
      { id: 'u2', name: 'U2', hcpIndex: null },
      { id: 'u3', name: 'U3', hcpIndex: null },
    ];
    // Slangen: a → 1, b → 2, c → 3. Lag 1 (10) er lavest og tar u1; deretter
    // er lag 1 fullt, så lag 2 (20) tar u2 og lag 3 tar u3.
    const { teamOf } = balancedTeams(all, [2, 2, 2]);
    expect(teamOf).toMatchObject({ u1: 1, u2: 2, u3: 3 });
  });

  // Orchestrator's choice after review (#2478): a team with a player without an
  // index has no sum and no average, so the cards say «–» and the spread
  // leaves it out. The deal itself is unchanged.
  it('et lag med en spiller uten indeks har ingen sum eller snitt', () => {
    const all: BalancePlayer[] = [
      { id: 'a', name: 'A', hcpIndex: 10 },
      { id: 'b', name: 'B', hcpIndex: 20 },
      { id: 'c', name: 'C', hcpIndex: 30 },
      { id: 'u', name: 'U', hcpIndex: null },
      { id: 'd', name: 'D', hcpIndex: 40 },
    ];
    // Lag à 3 og 2: 10 → 1, 20 → 2, så baklengs 30 → 2 og 40 → 1. U tar plassen
    // som er igjen på lag 1, så lag 1 har ingen verdi. Ett fullt regnet lag gir
    // ingen forskjell å vise.
    const result = balancedTeams(all, [3, 2]);
    expect(result.mode).toBe('average');
    expect(result.teamOf).toEqual({ a: 1, d: 1, u: 1, b: 2, c: 2 });
    expect(result.values).toEqual([null, 25]);
    expect(result.spread).toBeNull();

    const equal = balancedTeams(all.slice(0, 4), [2, 2]);
    // 10 → 1, 20 → 2, 30 → 2; U fyller lag 1.
    expect(equal.mode).toBe('sum');
    expect(equal.values).toEqual([null, 50]);
  });

  it('best ball med 8 der én venter: forskjellen regnes mellom de tre fullt regnede lagene', () => {
    const seven = ARTBOARD.filter((p) => p.id !== 'anders');
    const all = [...seven, { id: 'venter', name: 'Venter', hcpIndex: null }];
    const result = balancedTeams(all, [2, 2, 2, 2]);
    // 4,2 → 1, 9,4 → 2, 12,1 → 3, 15,8 → 4, så baklengs 18,4 → 4, 21,0 → 3,
    // 24,3 → 2. Den som venter, tar plassen på lag 1.
    expect(result.teamOf).toEqual({
      ida: 1, venter: 1, jonas: 2, tone: 2, sondre: 3, eirik: 3, kari: 4, marte: 4,
    });
    expect(result.values.map((v) => (v === null ? null : Number(v.toFixed(1))))).toEqual([
      null, 33.7, 33.1, 34.2,
    ]);
    expect(result.spread).toBeCloseTo(34.2 - 33.1, 9);
  });

  it('alle uten indeks: ingen verdier og spread null', () => {
    const result = balancedTeams(players([null, null, null, null]), [2, 2]);
    expect(Object.keys(result.teamOf)).toHaveLength(4);
    expect(result.values).toEqual([null, null]);
    expect(result.spread).toBeNull();
    expect(result.uncounted).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('ingen spillere og ingen lag', () => {
    expect(balancedTeams([], [])).toEqual({
      teamOf: {},
      values: [],
      mode: 'sum',
      spread: null,
      uncounted: [],
    });
  });
});

describe('teamHcpValues — tallene for et vilkårlig oppsett (#2478)', () => {
  it('et manuelt oppsett gir summene per lag og forskjellen', () => {
    const teamOf = { ida: 1, jonas: 1, kari: 2, anders: 2, sondre: 3, eirik: 3, tone: 4, marte: 4 };
    const result = teamHcpValues(teamOf, ARTBOARD);
    expect(result.mode).toBe('sum');
    expect(result.values.map((v) => Number(v?.toFixed(1)))).toEqual([13.6, 41.8, 33.1, 42.7]);
    expect(result.spread).toBeCloseTo(42.7 - 13.6, 9);
  });

  it('gir samme tall som balancedTeams for oppsettet «Jevne lag» ga', () => {
    const balanced = balancedTeams(ARTBOARD, [2, 2, 2, 2]);
    const { values, mode, spread } = teamHcpValues(balanced.teamOf, ARTBOARD);
    expect({ values, mode, spread }).toEqual({
      values: balanced.values,
      mode: balanced.mode,
      spread: balanced.spread,
    });
  });

  it('like store er antall spillere på kortene som har spillere: 4/4/3 gir snitt, et lag med ledig plass også', () => {
    const all = players(Array.from({ length: 11 }, (_, i) => 2 * (i + 1)));
    const fourFourThree = Object.fromEntries(all.map((p, i) => [p.id, (i % 3) + 1]));
    expect(teamHcpValues(fourFourThree, all).mode).toBe('average');

    // Lag 1 har to, lag 2 én: midt i fordelingen teller det som ulikt.
    expect(teamHcpValues({ p1: 1, p2: 1, p3: 2 }, all).mode).toBe('average');
    // Tomme lag teller ikke: to fulle par og ingen andre gir sum.
    expect(teamHcpValues({ p1: 1, p2: 1, p3: 3, p4: 3 }, all).mode).toBe('sum');
  });

  // Found on staging (4/4/3 in Texas): 0,4 + 1,8 + 9,8 sums to 12.000000000000002
  // in floating point, so the cards showed 5,6 and 4,0 while the line said 1,5.
  it('tallene har ikke flyttallsstøy: 5,55 og 4 skiller 1,55, ikke 1,5499…', () => {
    const all: BalancePlayer[] = [
      { id: 'b', name: 'B', hcpIndex: -1.2 },
      { id: 'e', name: 'E', hcpIndex: 3.5 },
      { id: 'h', name: 'H', hcpIndex: 8.4 },
      { id: 'j', name: 'J', hcpIndex: 11.5 },
      { id: 'c', name: 'C', hcpIndex: 0.4 },
      { id: 'd', name: 'D', hcpIndex: 1.8 },
      { id: 'i', name: 'I', hcpIndex: 9.8 },
    ];
    const result = teamHcpValues({ b: 1, e: 1, h: 1, j: 1, c: 2, d: 2, i: 2 }, all);
    expect(result.values).toEqual([5.55, 4]);
    expect(result.spread).toBe(1.55);
  });

  it('færre enn to fullt regnede lag gir ingen forskjell', () => {
    const all = players([10, null, 20]);
    expect(teamHcpValues({ p1: 1 }, all).spread).toBeNull();
    expect(teamHcpValues({ p1: 1, p2: 2, p3: 2 }, all)).toMatchObject({
      values: [10, null],
      spread: null,
    });
  });

  it('lag uten spillere gir null, og spillere uten lag regnes ikke', () => {
    const all = players([10, 20, 30]);
    const result = teamHcpValues({ p1: 1, p3: 3 }, all);
    expect(result.values).toEqual([10, null, 30]);
    expect(result.spread).toBe(20);
  });

  it('uncounted lister de valgte uten indeks, med eller uten lag', () => {
    const all = players([10, null, null]);
    expect(teamHcpValues({ p1: 1, p2: 1 }, all).uncounted).toEqual(['p2', 'p3']);
  });

  it('ingen lag: ingen verdier og spread null', () => {
    expect(teamHcpValues({}, players([10, 20]))).toEqual({
      values: [],
      mode: 'sum',
      spread: null,
      uncounted: [],
    });
  });
});
