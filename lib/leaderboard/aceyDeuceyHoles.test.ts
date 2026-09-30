import { describe, expect, it } from 'vitest';
import type { AceyDeuceyHoleRow, AceyDeuceyResult } from '@/lib/scoring/modes/types';
import { aceyDeuceyHoleCards } from './aceyDeuceyHoles';

// #2255 PR 3c: «Hull for hull» for Acey Deucey. Regnestykket bor her, så
// webbens visning og appens skjerm tegner de samme kortene.

type Cell = AceyDeuceyHoleRow['perPlayer'][number];

const cell = (userId: string, gross: number | null, effectiveScore = gross, points = 0): Cell => ({
  userId,
  gross,
  effectiveScore,
  points,
});

/**
 * Ett hull med cellene i gitt rekkefølge. Ace og deuce som motoren: unik
 * lavest og unik høyest, bare når alle har score.
 */
function hole(cells: Cell[], holeNumber = 1, overrides: Partial<AceyDeuceyHoleRow> = {}): AceyDeuceyHoleRow {
  const scored = cells.every((c) => c.effectiveScore != null);
  const effs = cells.map((c) => c.effectiveScore as number);
  const only = (target: number) => {
    const hits = cells.filter((c) => c.effectiveScore === target);
    return hits.length === 1 ? hits[0]!.userId : null;
  };
  return {
    holeNumber,
    par: 4,
    strokeIndex: holeNumber,
    scored,
    aceUserId: scored ? only(Math.min(...effs)) : null,
    deuceUserId: scored ? only(Math.max(...effs)) : null,
    pointsByPlayer: Object.fromEntries(cells.map((c) => [c.userId, c.points])),
    perPlayer: cells,
    ...overrides,
  };
}

function result(holes: AceyDeuceyHoleRow[], scoring: AceyDeuceyResult['scoring'] = 'net'): AceyDeuceyResult {
  return {
    kind: 'acey_deucey',
    scoring,
    holes,
    // Stillingen: Per 1., Ola og Kari delt 2., Nils 4. Fast rekkefølge: per,
    // kari, ola, nils (kari før ola på userId).
    players: [
      { userId: 'ola', aces: 1, deuces: 0, total: 0, rank: 2, tiedWith: ['kari'] },
      { userId: 'nils', aces: 0, deuces: 2, total: -6, rank: 4, tiedWith: [] },
      { userId: 'per', aces: 2, deuces: 0, total: 6, rank: 1, tiedWith: [] },
      { userId: 'kari', aces: 1, deuces: 0, total: 0, rank: 2, tiedWith: ['ola'] },
    ],
  };
}

const ids = (cards: ReturnType<typeof aceyDeuceyHoleCards>, i = 0) => cards.holes[i]!.rows.map((r) => r.userId);
const run = (cells: Cell[]) => aceyDeuceyHoleCards(result([hole(cells)]));

describe('aceyDeuceyHoleCards', () => {
  it('lavest score først: ace øverst og deuce nederst, uansett rekkefølgen inn', () => {
    const cards = run([cell('per', 5, 5, 0), cell('nils', 7, 7, -3), cell('ola', 3, 3, 3), cell('kari', 4, 4, 0)]);
    expect(ids(cards)).toEqual(['ola', 'kari', 'per', 'nils']);
    expect(cards.holes[0]!.rows.map((r) => r.tone)).toEqual(['ace', 'neutral', 'neutral', 'deuce']);
    expect(
      ids(run([cell('kari', 4, 4, 0), cell('ola', 3, 3, 3), cell('nils', 7, 7, -3), cell('per', 5, 5, 0)])),
    ).toEqual(['ola', 'kari', 'per', 'nils']);
  });

  it('lik score på et spilt hull: stillingen avgjør, uansett rekkefølgen inn', () => {
    // De to i midten har 4: Per leder stillingen, så Per står før Nils.
    const cells = [cell('nils', 4), cell('ola', 3, 3, 3), cell('per', 4), cell('kari', 6, 6, -3)];
    expect(ids(run(cells))).toEqual(['ola', 'per', 'nils', 'kari']);
    expect(ids(run([...cells].reverse()))).toEqual(['ola', 'per', 'nils', 'kari']);
  });

  it('delt lavest: ingen ace, de to står etter stillingen, og deuce er fortsatt deuce', () => {
    const cells = [cell('ola', 4), cell('per', 4), cell('nils', 5), cell('kari', 7, 7, -3)];
    const cards = run(cells);
    expect(ids(cards)).toEqual(['per', 'ola', 'nils', 'kari']);
    expect(cards.holes[0]!.rows.map((r) => r.tone)).toEqual(['neutral', 'neutral', 'neutral', 'deuce']);
    expect(ids(run([...cells].reverse()))).toEqual(['per', 'ola', 'nils', 'kari']);
  });

  it('delt plass også i stillingen: den faste rekkefølgen (plass, så userId) avgjør', () => {
    // Ola og Kari er delt 2. i stillingen og har lik score: kari før ola.
    const cells = [cell('ola', 5), cell('per', 3, 3, 3), cell('kari', 5), cell('nils', 6, 6, -3)];
    expect(ids(run(cells))).toEqual(['per', 'kari', 'ola', 'nils']);
    expect(ids(run([...cells].reverse()))).toEqual(['per', 'kari', 'ola', 'nils']);
  });

  it('et hull som venter: ingen tone, ingen poeng, rader etter stillingen', () => {
    // Nils har tastet, de andre ikke: ingen skal kåres for tidlig.
    const cells = [cell('nils', 4), cell('ola', null), cell('kari', null), cell('per', null)];
    const cards = run(cells);
    const card = cards.holes[0]!;
    expect(card.scored).toBe(false);
    expect(ids(cards)).toEqual(['per', 'kari', 'ola', 'nils']);
    expect(card.rows.map((r) => [r.tone, r.pointsText, r.effectiveScore])).toEqual([
      ['neutral', null, null],
      ['neutral', null, null],
      ['neutral', null, null],
      ['neutral', null, 4],
    ]);
    expect(ids(run([...cells].reverse()))).toEqual(['per', 'kari', 'ola', 'nils']);
  });

  it('poengene som «+3», «0» og «−3» (ekte minustegn) på et spilt hull', () => {
    const cards = run([cell('ola', 3, 3, 3), cell('kari', 4, 4, 0), cell('per', 5, 5, 0), cell('nils', 7, 7, -3)]);
    expect(cards.holes[0]!.rows.map((r) => r.pointsText)).toEqual(['+3', '0', '0', '−3']);
  });

  it('brutto står ved siden av bare i netto, og bare når den er annerledes', () => {
    const cells = [cell('ola', 4, 3, 3), cell('kari', 4, 4, 0), cell('per', 5, 5, 0), cell('nils', 7, 7, -3)];
    expect(aceyDeuceyHoleCards(result([hole(cells)])).holes[0]!.rows.map((r) => r.grossShown)).toEqual([
      4,
      null,
      null,
      null,
    ]);
    expect(
      aceyDeuceyHoleCards(result([hole(cells)], 'gross')).holes[0]!.rows.map((r) => r.grossShown),
    ).toEqual([null, null, null, null]);
  });

  it('scoringen som katalognøkkel', () => {
    expect(aceyDeuceyHoleCards(result([])).scoringKey).toBe('netto');
    expect(aceyDeuceyHoleCards(result([], 'gross')).scoringKey).toBe('brutto');
  });

  it('hullene i motorens rekkefølge, med par og indeks', () => {
    const cards = aceyDeuceyHoleCards(
      result([hole([], 1, { par: 3, strokeIndex: 9 }), hole([], 2, { par: 5, strokeIndex: 2 })]),
    );
    expect(cards.holes.map((h) => [h.holeNumber, h.par, h.strokeIndex])).toEqual([
      [1, 3, 9],
      [2, 5, 2],
    ]);
  });
});
