import { describe, it, expect } from 'vitest';
import { chunks, IN_LIST_CHUNK } from './chunks';

/** Type A (#2259): id lists for `.in()` are cut so the URL stays short. */
describe('chunks', () => {
  it('is empty for no items', () => {
    expect(chunks([])).toEqual([]);
  });

  it('keeps a short list as one slice', () => {
    expect(chunks([1, 2, 3])).toEqual([[1, 2, 3]]);
  });

  it('cuts at the size, in order, with a shorter last slice', () => {
    expect(chunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('gives no empty slice when the length is an exact multiple', () => {
    expect(chunks([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });

  it('defaults to slices of 100', () => {
    const slices = chunks(Array.from({ length: 250 }, (_, i) => i));
    expect(IN_LIST_CHUNK).toBe(100);
    expect(slices.map((s) => s.length)).toEqual([100, 100, 50]);
  });
});
