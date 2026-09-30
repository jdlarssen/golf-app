import { describe, expect, it } from 'vitest';
import type { NinesHoleRow, NinesResult } from '@/lib/scoring/modes/types';
import { ninesHoleCards, ninesPointsText } from './ninesHoles';

// #2255 PR 3c: «Hull for hull» for Nines / Split Sixes. Regnestykket bor her,
// så webbens visning og appens skjerm tegner de samme kortene.

type Cell = NinesHoleRow['perPlayer'][number];

function hole(overrides: Partial<NinesHoleRow> & { holeNumber: number }): NinesHoleRow {
  return {
    par: 4,
    strokeIndex: overrides.holeNumber,
    pending: false,
    perPlayer: [],
    pointsByPlayer: {},
    ...overrides,
  };
}

function result(
  holes: NinesHoleRow[],
  { variant = 'nines', scoring = 'net' }: Partial<Pick<NinesResult, 'variant' | 'scoring'>> = {},
): NinesResult {
  return {
    kind: 'nines',
    variant,
    scoring,
    holes,
    // Stillingen: Per 1., Ola og Kari delt 2. (fast rekkefølge: kari før ola).
    players: [
      { userId: 'ola', totalPoints: 8, holesScored: 2, rank: 2, tiedWith: ['kari'] },
      { userId: 'per', totalPoints: 10, holesScored: 2, rank: 1, tiedWith: [] },
      { userId: 'kari', totalPoints: 8, holesScored: 2, rank: 2, tiedWith: ['ola'] },
    ],
  };
}

const cell = (userId: string, gross: number | null, effectiveScore = gross, points = 0): Cell => ({
  userId,
  gross,
  effectiveScore,
  points,
});

/** Ett spilt hull med cellene i gitt rekkefølge, og poengene fra cellene. */
function playedHole(cells: Cell[], holeNumber = 1): NinesHoleRow {
  return hole({
    holeNumber,
    perPlayer: cells,
    pointsByPlayer: Object.fromEntries(cells.map((c) => [c.userId, c.points])),
  });
}

const ids = (cards: ReturnType<typeof ninesHoleCards>, i = 0) => cards.holes[i]!.rows.map((r) => r.userId);

describe('ninesHoleCards', () => {
  it('lavest score først, med plassen på hullet, uansett rekkefølgen inn', () => {
    const run = (cells: Cell[]) => ninesHoleCards(result([playedHole(cells)]));
    const cards = run([cell('per', 6), cell('ola', 4), cell('kari', 5)]);
    expect(ids(cards)).toEqual(['ola', 'kari', 'per']);
    expect(cards.holes[0]!.rows.map((r) => r.placement)).toEqual([1, 2, 3]);
    expect(ids(run([cell('kari', 5), cell('per', 6), cell('ola', 4)]))).toEqual(['ola', 'kari', 'per']);
  });

  it('lik score deler plassen (1, 1, 3), og stillingen avgjør rekkefølgen uansett rekkefølgen inn', () => {
    // Kari og Per delt lavest. Per leder stillingen, så Per står først.
    const run = (cells: Cell[]) => ninesHoleCards(result([playedHole(cells)]));
    const cards = run([cell('kari', 4), cell('per', 4), cell('ola', 5)]);
    expect(ids(cards)).toEqual(['per', 'kari', 'ola']);
    expect(cards.holes[0]!.rows.map((r) => r.placement)).toEqual([1, 1, 3]);
    expect(ids(run([cell('ola', 5), cell('per', 4), cell('kari', 4)]))).toEqual(['per', 'kari', 'ola']);
  });

  it('delt plass også i stillingen: den faste rekkefølgen (plass, så userId) avgjør', () => {
    const run = (cells: Cell[]) => ninesHoleCards(result([playedHole(cells)]));
    expect(ids(run([cell('per', 3), cell('ola', 5), cell('kari', 5)]))).toEqual(['per', 'kari', 'ola']);
    expect(ids(run([cell('kari', 5), cell('ola', 5), cell('per', 3)]))).toEqual(['per', 'kari', 'ola']);
  });

  it('lederen er den (eller de) med plass 1', () => {
    const cards = ninesHoleCards(result([playedHole([cell('kari', 4), cell('per', 4), cell('ola', 5)])]));
    expect(cards.holes[0]!.rows.map((r) => [r.userId, r.isLeader])).toEqual([
      ['per', true],
      ['kari', true],
      ['ola', false],
    ]);
    // Plass 1, 2, 3: bare plass 1 leder, ikke nummer to.
    const spread = ninesHoleCards(result([playedHole([cell('per', 6), cell('ola', 4), cell('kari', 5)])]));
    expect(spread.holes[0]!.rows.map((r) => [r.placement, r.isLeader])).toEqual([
      [1, true],
      [2, false],
      [3, false],
    ]);
  });

  it('et hull som venter: ingen pott, ingen plass og ingen leder, bare stillingen', () => {
    // Ola har tastet, de andre ikke: ingen skal kåres for tidlig.
    const cards = ninesHoleCards(
      result([
        hole({
          holeNumber: 3,
          pending: true,
          perPlayer: [cell('ola', 4), cell('kari', null), cell('per', null)],
          pointsByPlayer: { ola: 0, kari: 0, per: 0 },
        }),
      ]),
    );
    const card = cards.holes[0]!;
    expect(card.pot).toBeNull();
    expect(ids(cards)).toEqual(['per', 'kari', 'ola']);
    expect(card.rows.map((r) => [r.placement, r.isLeader])).toEqual([
      [null, false],
      [null, false],
      [null, false],
    ]);
    expect(card.rows.map((r) => r.effectiveScore)).toEqual([null, null, 4]);
  });

  it('en spiller uten score på et spilt hull står bakerst, uten plass', () => {
    const cards = ninesHoleCards(result([playedHole([cell('per', null), cell('ola', 5), cell('kari', 4)])]));
    expect(ids(cards)).toEqual(['kari', 'ola', 'per']);
    expect(cards.holes[0]!.rows.map((r) => r.placement)).toEqual([1, 2, null]);
  });

  it('potten etter varianten: Nines 9, Split Sixes 6', () => {
    const played = playedHole([cell('ola', 4)]);
    expect(ninesHoleCards(result([played])).holes[0]!.pot).toBe(9);
    expect(ninesHoleCards(result([played], { variant: 'split_sixes' })).holes[0]!.pot).toBe(6);
  });

  it('poengene fra hullet vises bare over 0', () => {
    // Split Sixes: sistemann får 0.
    const cards = ninesHoleCards(
      result([playedHole([cell('ola', 4, 4, 4), cell('kari', 5, 5, 2), cell('per', 6, 6, 0)])], {
        variant: 'split_sixes',
      }),
    );
    expect(cards.holes[0]!.rows.map((r) => [r.userId, r.pointsShown])).toEqual([
      ['ola', 4],
      ['kari', 2],
      ['per', null],
    ]);
  });

  it('brutto står ved siden av bare i netto, og bare når den er annerledes', () => {
    const cells = [cell('ola', 5, 4), cell('kari', 5, 5)];
    expect(ninesHoleCards(result([playedHole(cells)])).holes[0]!.rows.map((r) => r.grossShown)).toEqual([5, null]);
    expect(
      ninesHoleCards(result([playedHole(cells)], { scoring: 'gross' })).holes[0]!.rows.map((r) => r.grossShown),
    ).toEqual([null, null]);
  });

  it('varianten og scoringen som katalognøkler', () => {
    const nines = ninesHoleCards(result([]));
    expect([nines.variantKey, nines.scoringKey]).toEqual(['variantNines', 'netto']);
    const sixes = ninesHoleCards(result([], { variant: 'split_sixes', scoring: 'gross' }));
    expect([sixes.variantKey, sixes.scoringKey]).toEqual(['variantSplitSixes', 'brutto']);
  });

  it('hullene i motorens rekkefølge, med par og indeks', () => {
    const cards = ninesHoleCards(
      result([hole({ holeNumber: 1, par: 3, strokeIndex: 9 }), hole({ holeNumber: 2, par: 5, strokeIndex: 2 })]),
    );
    expect(cards.holes.map((h) => [h.holeNumber, h.par, h.strokeIndex])).toEqual([
      [1, 3, 9],
      [2, 5, 2],
    ]);
  });
});

describe('ninesPointsText', () => {
  const oneDecimal = (n: number) => `(${n.toFixed(1)})`;
  it('hele tall rent, del-poeng med én desimal fra flaten', () => {
    expect(ninesPointsText(4, oneDecimal)).toBe('4');
    expect(ninesPointsText(2.25, oneDecimal)).toBe('(2.3)');
  });
});
