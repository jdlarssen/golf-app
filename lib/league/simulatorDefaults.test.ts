import { describe, it, expect } from 'vitest';
import { defaultBestN } from './simulatorDefaults';

describe('defaultBestN', () => {
  it.each([
    [7, 5],
    [3, 1],
    [2, 1],
    [1, 1],
    [0, 1],
  ])('%i rounds → best %i count', (rounds, best) => {
    expect(defaultBestN(rounds)).toBe(best);
  });
});
