import { describe, it, expect } from 'vitest';
import { finishedCupBlocksPlay } from './finishedCup';

describe('finishedCupBlocksPlay (#2214)', () => {
  it.each([
    ['finished', true],
    ['active', false],
    ['draft', false],
    [null, false],
    [undefined, false],
  ])('%s → %s', (status, blocks) => {
    expect(finishedCupBlocksPlay(status)).toBe(blocks);
  });
});
