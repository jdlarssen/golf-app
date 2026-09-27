import { describe, it, expect } from 'vitest';
import { MODE_LABELS, type GameMode } from '@/lib/scoring/modes/types';
import { MAX_STROKES, MIN_STROKES } from './strokeEntry';
import {
  formatUsesScoreRail,
  nextRailSeat,
  railStrokes,
  strikeStrokes,
  strokeTerm,
} from './scoreRail';

describe('railStrokes', () => {
  it.each([
    { par: 3, expected: [2, 3, 4, 5, 6] },
    { par: 4, expected: [3, 4, 5, 6, 7] },
    { par: 5, expected: [4, 5, 6, 7, 8] },
    { par: 6, expected: [5, 6, 7, 8, 9] },
  ])('par $par → $expected', ({ par, expected }) => {
    expect(railStrokes(par)).toEqual(expected);
  });

  it('clamps to the stroke bounds without duplicates', () => {
    // No real hole has par 1 or 14, but the window must never offer a value
    // the stroke rule rejects, nor the same value twice.
    expect(railStrokes(1)).toEqual([MIN_STROKES, 2, 3, 4]);
    expect(railStrokes(14)).toEqual([13, 14, MAX_STROKES]);
  });
});

describe('strokeTerm', () => {
  it.each([
    { strokes: 1, par: 4, expected: 'albatross' },
    { strokes: 2, par: 5, expected: 'albatross' },
    { strokes: 3, par: 5, expected: 'eagle' },
    { strokes: 3, par: 4, expected: 'birdie' },
    { strokes: 4, par: 4, expected: 'par' },
    { strokes: 5, par: 4, expected: 'bogey' },
    { strokes: 6, par: 4, expected: 'doubleBogey' },
    { strokes: 7, par: 4, expected: 'tripleBogey' },
    { strokes: 8, par: 4, expected: 'over' },
    { strokes: 9, par: 4, expected: 'over' },
  ] as const)('$strokes on par $par → $expected', ({ strokes, par, expected }) => {
    expect(strokeTerm(strokes, par)).toBe(expected);
  });
});

describe('strikeStrokes', () => {
  it.each([
    // Net double bogey: par + the hole's strokes + 2.
    { par: 4, extra: 0, expected: 6 },
    { par: 4, extra: 1, expected: 7 },
    { par: 5, extra: 2, expected: 9 },
    // Plus handicap gives a stroke back.
    { par: 4, extra: -1, expected: 5 },
    // Clamped to the stroke rule's ceiling.
    { par: 6, extra: 9, expected: MAX_STROKES },
  ])('par $par, $extra strokes → $expected', ({ par, extra, expected }) => {
    expect(strikeStrokes(par, extra)).toBe(expected);
  });
});

describe('formatUsesScoreRail', () => {
  const modes = Object.keys(MODE_LABELS) as GameMode[];

  it.each(modes)('%s', (mode) => {
    // BBB's points come from the bingo/bango/bongo section, not from strokes,
    // so it keeps its cards. Every other format enters strokes per card.
    expect(formatUsesScoreRail(mode)).toBe(mode !== 'bingo_bango_bongo');
  });

  it('fails closed on an unknown mode at runtime', () => {
    expect(formatUsesScoreRail('not_a_mode' as GameMode)).toBe(false);
  });
});

describe('nextRailSeat', () => {
  const empty = { score: null, locked: false };
  const scored = { score: 4, locked: false };
  const locked = { score: null, locked: true };

  it('returns the start seat when it is empty', () => {
    expect(nextRailSeat({ seats: [empty, empty, empty, empty], startIndex: 1 })).toBe(1);
  });

  it('walks forward and wraps around', () => {
    // Four empty seats, I am seat 2 (index 1): 2 → 3 → 4 → 1 → done.
    const seats = [empty, empty, empty, empty];
    expect(nextRailSeat({ seats, startIndex: 1 })).toBe(1);
    const afterTwo = [empty, scored, empty, empty];
    expect(nextRailSeat({ seats: afterTwo, startIndex: 2 })).toBe(2);
    const afterThree = [empty, scored, scored, empty];
    expect(nextRailSeat({ seats: afterThree, startIndex: 3 })).toBe(3);
    const afterFour = [empty, scored, scored, scored];
    expect(nextRailSeat({ seats: afterFour, startIndex: 4 })).toBe(0);
    const allDone = [scored, scored, scored, scored];
    expect(nextRailSeat({ seats: allDone, startIndex: 1 })).toBeNull();
  });

  it('skips a locked seat', () => {
    expect(nextRailSeat({ seats: [scored, empty, locked, empty], startIndex: 2 })).toBe(3);
  });

  it('returns null when only locked seats are left', () => {
    expect(nextRailSeat({ seats: [scored, locked, scored], startIndex: 0 })).toBeNull();
  });

  it('returns null for an empty flight', () => {
    expect(nextRailSeat({ seats: [], startIndex: 0 })).toBeNull();
  });

  it('normalizes a start index outside the flight', () => {
    expect(nextRailSeat({ seats: [empty, scored, scored], startIndex: 3 })).toBe(0);
    expect(nextRailSeat({ seats: [scored, empty, scored], startIndex: -1 })).toBe(1);
  });
});
