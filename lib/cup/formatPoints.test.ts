import { describe, it, expect } from 'vitest';
import { formatPoints } from './formatPoints';

describe('formatPoints', () => {
  it.each<[number, string]>([
    [0, '0'],
    [1, '1'],
    [0.5, '0,5'],
    [2.5, '2,5'],
    [12, '12'],
  ])('%d → %s', (input, expected) => {
    expect(formatPoints(input)).toBe(expected);
  });
});
