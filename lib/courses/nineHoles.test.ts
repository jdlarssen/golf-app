import { describe, expect, it } from 'vitest';
import {
  canSplitSingleIndices,
  expandNineHoles,
  foldToNine,
  splitSingleIndices,
} from './nineHoles';
import { allStrokeIndicesUnique } from './coursePayload';

const PARS = [4, 4, 5, 3, 4, 4, 3, 5, 4];
const ROUND1 = [7, 3, 17, 1, 11, 5, 15, 9, 13];
const ROUND2 = [8, 4, 18, 2, 12, 6, 16, 10, 14];

const nine = PARS.map((par, i) => ({
  hole_number: i + 1,
  par_mens: par,
  par_ladies: par === 4 ? 5 : par,
  par_juniors: par,
  stroke_index: ROUND1[i],
}));

describe('expandNineHoles (#2484)', () => {
  it('gives 18 holes: 10–18 take the par of 1–9 and the second round index', () => {
    const holes = expandNineHoles(nine, ROUND2);
    expect(holes).toHaveLength(18);
    expect(holes.map((h) => h.hole_number)).toEqual(
      Array.from({ length: 18 }, (_, i) => i + 1),
    );
    for (let i = 0; i < 9; i++) {
      const front = holes[i];
      const back = holes[i + 9];
      expect(front.stroke_index).toBe(ROUND1[i]);
      expect(back.stroke_index).toBe(ROUND2[i]);
      expect(back.par_mens).toBe(front.par_mens);
      expect(back.par_ladies).toBe(front.par_ladies);
      expect(back.par_juniors).toBe(front.par_juniors);
    }
  });

  it('uses every index 1–18 once when the two rows split them', () => {
    const holes = expandNineHoles(nine, ROUND2);
    expect(allStrokeIndicesUnique(holes.map((h) => h.stroke_index))).toBe(true);
    expect([...holes.map((h) => h.stroke_index)].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 18 }, (_, i) => i + 1),
    );
  });

  it('keeps the duplicate when a number stands in both rows', () => {
    const round2 = [...ROUND2];
    round2[0] = 7; // also hole 1's first round index
    const holes = expandNineHoles(nine, round2);
    expect(allStrokeIndicesUnique(holes.map((h) => h.stroke_index))).toBe(false);
  });

  it('reads the nine in hole order, whatever order they come in', () => {
    const holes = expandNineHoles([...nine].reverse(), ROUND2);
    expect(holes[0].hole_number).toBe(1);
    expect(holes[9]).toMatchObject({ hole_number: 10, par_mens: 4, stroke_index: 8 });
  });

  it('works on the form strings too', () => {
    const strings = nine.map((h) => ({
      hole_number: h.hole_number,
      par_mens: String(h.par_mens),
      par_ladies: String(h.par_ladies),
      par_juniors: String(h.par_juniors),
      stroke_index: String(h.stroke_index),
    }));
    const holes = expandNineHoles(strings, ROUND2.map(String));
    expect(holes[12]).toEqual({
      hole_number: 13,
      par_mens: '3',
      par_ladies: '3',
      par_juniors: '3',
      stroke_index: '2',
    });
  });

  it('refuses anything but nine holes and nine second round indices', () => {
    expect(() => expandNineHoles(nine.slice(0, 8), ROUND2)).toThrow();
    expect(() => expandNineHoles(nine, ROUND2.slice(0, 8))).toThrow();
  });
});

describe('foldToNine (#2484)', () => {
  it('gives back the nine and the second round of an expanded course', () => {
    const folded = foldToNine(expandNineHoles(nine, ROUND2));
    expect(folded.holes).toEqual(nine);
    expect(folded.secondRound).toEqual(ROUND2);
  });

  it('round-trips: expand(fold(x)) equals x', () => {
    const holes = expandNineHoles(nine, ROUND2);
    const folded = foldToNine(holes);
    expect(expandNineHoles(folded.holes, folded.secondRound)).toEqual(holes);
  });

  it('folds an 18-hole course on 1–9: par from the front nine, round 2 = indices of 10–18', () => {
    const eighteen = Array.from({ length: 18 }, (_, i) => ({
      hole_number: i + 1,
      par_mens: i < 9 ? 4 : 3,
      par_ladies: i < 9 ? 4 : 3,
      par_juniors: i < 9 ? 4 : 3,
      stroke_index: i + 1,
    }));
    const folded = foldToNine(eighteen);
    expect(folded.holes.map((h) => h.par_mens)).toEqual(Array(9).fill(4));
    expect(folded.holes.map((h) => h.stroke_index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(folded.secondRound).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18]);
  });
});

describe('splitSingleIndices (#2484)', () => {
  it('turns one index per hole into odd for round 1 and even for round 2', () => {
    const { round1, round2 } = splitSingleIndices([7, 3, 9, 1, 5, 2, 8, 4, 6]);
    expect(round1).toEqual([13, 5, 17, 1, 9, 3, 15, 7, 11]);
    expect(round2).toEqual([14, 6, 18, 2, 10, 4, 16, 8, 12]);
    expect(round1.every((n) => n % 2 === 1)).toBe(true);
    expect(round2.every((n) => n % 2 === 0)).toBe(true);
    expect(allStrokeIndicesUnique([...round1, ...round2])).toBe(true);
  });
});

describe('canSplitSingleIndices (#2484)', () => {
  const empty = Array(9).fill('');
  const single = ['7', '3', '9', '1', '5', '2', '8', '4', '6'];

  it('is true for nine numbers 1–9 and an empty second row', () => {
    expect(canSplitSingleIndices(single, empty)).toBe(true);
    expect(canSplitSingleIndices([' 7', ...single.slice(1)], [' ', ...empty.slice(1)])).toBe(true);
  });

  it('is false once anything stands in the second row', () => {
    expect(canSplitSingleIndices(single, ['8', ...empty.slice(1)])).toBe(false);
  });

  it('is false while the first row is not nine numbers 1–9, each once', () => {
    expect(canSplitSingleIndices(empty, empty)).toBe(false);
    expect(canSplitSingleIndices(['', ...single.slice(1)], empty)).toBe(false);
    expect(canSplitSingleIndices(['10', ...single.slice(1)], empty)).toBe(false);
    expect(canSplitSingleIndices(['0', ...single.slice(1)], empty)).toBe(false);
    expect(canSplitSingleIndices(['1.5', ...single.slice(1)], empty)).toBe(false);
    expect(canSplitSingleIndices(['3', ...single.slice(1)], empty)).toBe(false);
    expect(canSplitSingleIndices(single.slice(0, 8), empty)).toBe(false);
  });
});
