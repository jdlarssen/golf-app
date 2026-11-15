import { describe, it, expect } from 'vitest';
import { normalizeSlotHoles, withSlotHole } from './sideSlotHoles';

/**
 * Type A (#2283). The setup form's rule for the hole per side-contest slot: a
 * hole another slot of the category has moves, it is never kept twice (the
 * shared parser refuses that, `sideTournamentPayload.test.ts`).
 */
describe('withSlotHole', () => {
  it('sets the hole for a slot, 1-based', () => {
    expect(withSlotHole([], 1, 9)).toEqual([9]);
    expect(withSlotHole([9], 2, 7)).toEqual([9, 7]);
  });

  it('pads a slot past the end with null', () => {
    expect(withSlotHole([], 2, 7)).toEqual([null, 7]);
  });

  it('null clears the slot and leaves the other', () => {
    expect(withSlotHole([9, 7], 1, null)).toEqual([null, 7]);
  });

  it('a hole the other slot has moves here and clears that slot', () => {
    expect(withSlotHole([9, 7], 2, 9)).toEqual([null, 9]);
    expect(withSlotHole([9, 7], 1, 7)).toEqual([7, null]);
  });

  it('choosing the hole a slot already has changes nothing', () => {
    expect(withSlotHole([9, 7], 1, 9)).toEqual([9, 7]);
  });

  it('does not change the array it is given', () => {
    const before: (number | null)[] = [9, 7];
    withSlotHole(before, 2, 9);
    expect(before).toEqual([9, 7]);
  });
});

describe('normalizeSlotHoles', () => {
  it('keeps whole holes in 1–18, nulls included', () => {
    expect(normalizeSlotHoles([9, null])).toEqual([9, null]);
    expect(normalizeSlotHoles([1, 18])).toEqual([1, 18]);
  });

  it('is empty for a column without holes or a draft without the field', () => {
    expect(normalizeSlotHoles(null)).toEqual([]);
    expect(normalizeSlotHoles(undefined)).toEqual([]);
  });

  it('turns anything else into a slot without a hole (storage is not trusted)', () => {
    expect(normalizeSlotHoles([0, 19])).toEqual([null, null]);
    expect(normalizeSlotHoles([7.5, '7'])).toEqual([null, null]);
    expect(normalizeSlotHoles('9')).toEqual([]);
  });

  it('a second slot on the same hole loses it, and slots past two are dropped', () => {
    expect(normalizeSlotHoles([9, 9])).toEqual([9, null]);
    expect(normalizeSlotHoles([3, 4, 5])).toEqual([3, 4]);
  });
});
