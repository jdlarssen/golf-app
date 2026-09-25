import { describe, it, expect } from 'vitest';
import { isRosterLocked, type GameStatus } from './status';

describe('isRosterLocked (#182, #2212)', () => {
  it.each<[GameStatus, boolean]>([
    ['draft', false],
    ['scheduled', false],
    ['active', true],
    ['finished', true],
  ])('%s → %s', (status, locked) => {
    expect(isRosterLocked(status)).toBe(locked);
  });
});
