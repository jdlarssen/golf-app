import { describe, it, expect } from 'vitest';
import {
  coursePar,
  genderParRows,
  hardestAndEasiest,
  indexStatusLine,
  nextPar,
  sortTeesForCard,
  splitNines,
} from './courseCard';

// Type A for the course card on /baner/[slug] (#2277): the pure helpers the
// page and CourseCardGrid read. Shared with «Legg til bane» (#2278).

type Hole = {
  hole_number: number;
  par_mens: number | null;
  par_ladies: number | null;
  par_juniors: number | null;
  stroke_index: number;
};

function hole(n: number, par: number, si: number, extra: Partial<Hole> = {}): Hole {
  return { hole_number: n, par_mens: par, par_ladies: par, par_juniors: par, stroke_index: si, ...extra };
}

// Byneset North as the artboard draws it: out 35, in 36, index 1 on hole 4,
// index 18 on hole 10.
const PARS = [5, 3, 4, 4, 4, 3, 5, 3, 4, 5, 4, 4, 3, 4, 4, 3, 5, 4];
const INDEXES = [7, 13, 5, 1, 11, 17, 3, 15, 9, 18, 14, 8, 16, 2, 12, 6, 10, 4];
const EIGHTEEN = PARS.map((par, i) => hole(i + 1, par, INDEXES[i]));

describe('splitNines', () => {
  it.each([
    ['18 holes', EIGHTEEN, 9, 9],
    ['9 holes', EIGHTEEN.slice(0, 9), 9, 0],
    ['no holes', [], 0, 0],
  ])('%s → out and in by hole number', (_label, holes, outCount, inCount) => {
    const { out, in: back } = splitNines(holes);
    expect(out.map((h) => h.hole_number)).toEqual(
      Array.from({ length: outCount }, (_, i) => i + 1),
    );
    expect(back.map((h) => h.hole_number)).toEqual(
      Array.from({ length: inCount }, (_, i) => i + 10),
    );
  });

  it('sorts unsorted input by hole number', () => {
    const shuffled = [EIGHTEEN[11], EIGHTEEN[2], EIGHTEEN[9], EIGHTEEN[0], EIGHTEEN[1]];
    const { out, in: back } = splitNines(shuffled);
    expect(out.map((h) => h.hole_number)).toEqual([1, 2, 3]);
    expect(back.map((h) => h.hole_number)).toEqual([10, 12]);
  });
});

describe('nextPar', () => {
  it.each([
    ['3', 4],
    ['4', 5],
    ['5', 3],
    ['6', 3],
    ['', 3],
  ])('%j → %i', (value, expected) => {
    expect(nextPar(value)).toBe(expected);
  });
});

describe('indexStatusLine', () => {
  const EMPTY = Array<string>(18).fill('');
  const missingOf = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
  type Line = ReturnType<typeof indexStatusLine>;
  it.each<[string, string[], number[], Line]>([
    ['nothing typed', EMPTY, missingOf(18), { kind: 'hint' }],
    ['only blanks typed', Array<string>(18).fill('  '), missingOf(18), { kind: 'hint' }],
    ['one missing', ['7', ...EMPTY.slice(1)], [3], { kind: 'list', numbers: [3] }],
    ['two missing', ['7', ...EMPTY.slice(1)], [7, 14], { kind: 'list', numbers: [7, 14] }],
    ['six missing', ['7', ...EMPTY.slice(1)], missingOf(6), { kind: 'list', numbers: missingOf(6) }],
    ['seven missing', ['7', ...EMPTY.slice(1)], missingOf(7), { kind: 'count', count: 7 }],
    ['all there', ['7', ...EMPTY.slice(1)], [], null],
  ])('%s', (_label, values, missing, expected) => {
    expect(indexStatusLine(values, missing)).toEqual(expected);
  });
});

describe('coursePar', () => {
  it.each([
    ['18 holes', EIGHTEEN, 71],
    ['the out nine', EIGHTEEN.slice(0, 9), 35],
    ['the in nine', EIGHTEEN.slice(9), 36],
    ['no holes', [], 0],
    ['a null men\'s par counts 0', [hole(1, 4, 1), hole(2, 4, 2, { par_mens: null })], 4],
  ])('%s → %i', (_label, holes, expected) => {
    expect(coursePar(holes)).toBe(expected);
  });
});

describe('hardestAndEasiest', () => {
  it('picks the lowest and the highest stroke index', () => {
    const result = hardestAndEasiest(EIGHTEEN);
    expect(result?.hardest.hole_number).toBe(4);
    expect(result?.easiest.hole_number).toBe(10);
  });

  it('gives null for no holes', () => {
    expect(hardestAndEasiest([])).toBeNull();
  });

  it('gives the same hole twice for one hole', () => {
    const only = hole(7, 3, 9);
    expect(hardestAndEasiest([only])).toEqual({ hardest: only, easiest: only });
  });

  it('keeps the lowest hole number on a tied index', () => {
    const result = hardestAndEasiest([hole(5, 4, 2), hole(3, 4, 2), hole(8, 4, 6), hole(6, 4, 6)]);
    expect(result?.hardest.hole_number).toBe(3);
    expect(result?.easiest.hole_number).toBe(6);
  });
});

describe('genderParRows', () => {
  it.each([
    ['every gender on the men\'s par', EIGHTEEN, []],
    ['ladies differ on one hole', [hole(1, 4, 1), hole(2, 5, 2, { par_ladies: 4 })], ['ladies']],
    ['juniors differ on one hole', [hole(1, 4, 1, { par_juniors: 5 }), hole(2, 4, 2)], ['juniors']],
    [
      'both differ',
      [hole(1, 4, 1, { par_ladies: 5 }), hole(2, 3, 2, { par_juniors: 4 })],
      ['ladies', 'juniors'],
    ],
    ['a missing ladies\' par is no difference', [hole(1, 4, 1, { par_ladies: null })], []],
    ['no holes', [], []],
  ])('%s → %j', (_label, holes, expected) => {
    expect(genderParRows(holes)).toEqual(expected);
  });
});

describe('sortTeesForCard', () => {
  it('sorts longest first, tees without a length last, then by name', () => {
    const tees = [
      { name: 'Gul', length_meters: 5200 },
      { name: 'Uten B', length_meters: null },
      { name: 'Hvit', length_meters: 5984 },
      { name: 'Uten A', length_meters: null },
      { name: 'Blå', length_meters: 5200 },
    ];
    expect(sortTeesForCard(tees).map((t) => t.name)).toEqual([
      'Hvit',
      'Blå',
      'Gul',
      'Uten A',
      'Uten B',
    ]);
  });

  it('leaves the input untouched and handles no tees', () => {
    const tees = [
      { name: 'B', length_meters: 1 },
      { name: 'A', length_meters: 2 },
    ];
    sortTeesForCard(tees);
    expect(tees.map((t) => t.name)).toEqual(['B', 'A']);
    expect(sortTeesForCard([])).toEqual([]);
  });
});
