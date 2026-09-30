import { describe, expect, it } from 'vitest';
import type {
  MatchplayHoleResult,
  RoundRobinHoleRow,
  RoundRobinPlayerCell,
  RoundRobinResult,
} from '@/lib/scoring/modes/types';
import { roundRobinHoleCards } from './roundRobinHoles';

// #2255 PR 3c: «Hull for hull» for Round Robin. Regnestykket bor her, så
// webbens visning og appens skjerm tegner de samme segmentene og kortene.

const cell = (
  userId: string,
  gross: number | null,
  net: number | null = gross,
  isContributor = false,
): RoundRobinPlayerCell => ({
  userId,
  gross,
  extraStrokes: gross != null && net != null ? gross - net : 0,
  net,
  isContributor,
  par: 4,
});

/** Rotasjonen som motoren: A+B mot C+D, så A+C mot B+D, så A+D mot B+C. */
const CONSTELLATION: Record<1 | 2 | 3, [[string, string], [string, string]]> = {
  1: [['a', 'b'], ['c', 'd']],
  2: [['a', 'c'], ['b', 'd']],
  3: [['a', 'd'], ['b', 'c']],
};

function segmentOf(holeNumber: number): 1 | 2 | 3 {
  return holeNumber <= 6 ? 1 : holeNumber <= 12 ? 2 : 3;
}

function hole(
  holeNumber: number,
  result: MatchplayHoleResult = 'unplayed',
  cells?: { side1: RoundRobinPlayerCell[]; side2: RoundRobinPlayerCell[] },
): RoundRobinHoleRow {
  const segment = segmentOf(holeNumber);
  const [side1Ids, side2Ids] = CONSTELLATION[segment];
  const side1Players = cells?.side1 ?? side1Ids.map((id) => cell(id, null));
  const side2Players = cells?.side2 ?? side2Ids.map((id) => cell(id, null));
  return {
    holeNumber,
    segment,
    par: 4,
    side1Par: 4,
    side2Par: 4,
    strokeIndex: holeNumber,
    side1PlayerIds: side1Ids,
    side2PlayerIds: side2Ids,
    side1Players,
    side2Players,
    side1BestNet: null,
    side2BestNet: null,
    side1ContributorIds: side1Players.filter((c) => c.isContributor).map((c) => c.userId),
    side2ContributorIds: side2Players.filter((c) => c.isContributor).map((c) => c.userId),
    result,
    holeWinByPlayer: {},
  };
}

function result(holes: RoundRobinHoleRow[]): RoundRobinResult {
  return { kind: 'round_robin', allowancePct: 85, holes, players: [] };
}

const ids = (side: { rows: readonly { userId: string }[] }) => side.rows.map((r) => r.userId);

describe('roundRobinHoleCards', () => {
  it('tre segmenter i rekkefølge, hullene stigende i hvert, uansett rekkefølgen inn', () => {
    const cards = roundRobinHoleCards(result([hole(14), hole(8), hole(2), hole(1), hole(13), hole(7)]));
    expect(cards.segments.map((s) => [s.segment, s.holes.map((h) => h.holeNumber)])).toEqual([
      [1, [1, 2]],
      [2, [7, 8]],
      [3, [13, 14]],
    ]);
  });

  it('et segment uten hull står ikke', () => {
    const cards = roundRobinHoleCards(result([hole(1), hole(13)]));
    expect(cards.segments.map((s) => s.segment)).toEqual([1, 3]);
  });

  it('motoren uten fire spillere gir ingen hull, og da ingen segmenter', () => {
    expect(roundRobinHoleCards(result([])).segments).toEqual([]);
  });

  it('konstellasjonen (hvem som er partnere) og hull-spennet per segment', () => {
    const cards = roundRobinHoleCards(result([hole(1), hole(7), hole(13)]));
    expect(cards.segments.map((s) => [s.holesKey, s.side1PlayerIds, s.side2PlayerIds])).toEqual([
      ['segmentHoles1', ['a', 'b'], ['c', 'd']],
      ['segmentHoles2', ['a', 'c'], ['b', 'd']],
      ['segmentHoles3', ['a', 'd'], ['b', 'c']],
    ]);
  });

  it('radene på hver side følger konstellasjonen, uansett rekkefølgen cellene kommer i', () => {
    const cards = roundRobinHoleCards(
      result([
        hole(7, 'tied', {
          side1: [cell('c', 4), cell('a', 4)],
          side2: [cell('d', 4), cell('b', 4)],
        }),
      ]),
    );
    const [side1, side2] = cards.segments[0]!.holes[0]!.sides;
    expect([ids(side1), ids(side2)]).toEqual([
      ['a', 'c'],
      ['b', 'd'],
    ]);
  });

  it('utfallet: vinnersiden markeres på siden, delt og venter står i hodet', () => {
    const cards = roundRobinHoleCards(
      result([hole(1, 'side1_wins'), hole(2, 'side2_wins'), hole(3, 'tied'), hole(4, 'unplayed')]),
    );
    expect(
      cards.segments[0]!.holes.map((h) => [h.holeNumber, h.outcomeKey, h.sides.map((s) => s.isWinner)]),
    ).toEqual([
      [1, null, [true, false]],
      [2, null, [false, true]],
      [3, 'outcomeChipTied', [false, false]],
      [4, 'outcomeChipVenter', [false, false]],
    ]);
    expect(cards.segments[0]!.holes[0]!.sides.map((s) => s.side)).toEqual([1, 2]);
  });

  it('stjerna (sidens beste netto) bare når spilleren har netto', () => {
    // Motoren merker ikke en spiller uten score, men visningen krever netto uansett.
    const cards = roundRobinHoleCards(
      result([
        hole(1, 'side1_wins', {
          side1: [cell('a', 4, 4, true), cell('b', null, null, true)],
          side2: [cell('c', 5, 5, true), cell('d', 6)],
        }),
      ]),
    );
    const [side1, side2] = cards.segments[0]!.holes[0]!.sides;
    expect([...side1.rows, ...side2.rows].map((r) => [r.userId, r.isContributor])).toEqual([
      ['a', true],
      ['b', false],
      ['c', true],
      ['d', false],
    ]);
  });

  it('brutto ved siden av bare når den er annerledes enn netto, og netto slik den er', () => {
    const cards = roundRobinHoleCards(
      result([
        hole(1, 'side1_wins', {
          side1: [cell('a', 5, 4, true), cell('b', 5, 5)],
          side2: [cell('c', null, null), cell('d', 6, 6)],
        }),
      ]),
    );
    const [side1, side2] = cards.segments[0]!.holes[0]!.sides;
    expect([...side1.rows, ...side2.rows].map((r) => [r.userId, r.grossShown, r.net])).toEqual([
      ['a', 5, 4],
      ['b', null, 5],
      ['c', null, null],
      ['d', null, 6],
    ]);
  });

  it('par og indeks fra hullet', () => {
    const row = { ...hole(5), par: 3, strokeIndex: 11 };
    const card = roundRobinHoleCards(result([row])).segments[0]!.holes[0]!;
    expect([card.holeNumber, card.par, card.strokeIndex]).toEqual([5, 3, 11]);
  });
});
