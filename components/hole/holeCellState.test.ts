import { describe, it, expect } from 'vitest';
import { holeCellState, type HoleCellState } from './HoleStrip';

/**
 * #1352 — the hole strip used to derive «done» purely from position, so a
 * skipped hole looked identical to an entered one. These cases pin the four
 * states and, above all, the precedence: current > scored > missed > future.
 */
describe('holeCellState', () => {
  const scored = (...holes: number[]) => new Set(holes);

  it.each<[string, number, number, Set<number>, HoleCellState]>([
    // The hole you're standing on always reads as current — the strip must not
    // shout «missing» about the hole you're entering right now.
    ['current hole without a score', 8, 8, scored(1, 2), 'current'],
    ['current hole with a score', 8, 8, scored(8), 'current'],
    // Scored wins over position in both directions.
    ['earlier hole with a score', 3, 8, scored(3), 'scored'],
    ['later hole with a score (played out of order)', 12, 8, scored(12), 'scored'],
    // Missed is the new state: behind you, and no score.
    ['earlier hole without a score', 5, 8, scored(1, 2, 3, 4), 'missed'],
    ['hole 1 with an empty set', 1, 8, scored(), 'missed'],
    // Everything ahead of you without a score is simply not played yet.
    ['later hole without a score', 15, 8, scored(1, 2), 'future'],
    ['hole right after the current one', 9, 8, scored(), 'future'],
  ])('%s → %s', (_label, n, currentHole, scoredHoles, expected) => {
    expect(holeCellState(n, currentHole, scoredHoles)).toBe(expected);
  });

  it('with an empty set every hole behind the current one is missed, every hole ahead is future', () => {
    const states = Array.from({ length: 18 }, (_, i) =>
      holeCellState(i + 1, 10, new Set()),
    );
    expect(states.slice(0, 9)).toEqual(Array(9).fill('missed'));
    expect(states[9]).toBe('current');
    expect(states.slice(10)).toEqual(Array(8).fill('future'));
  });

  it('with a full set no hole is ever missed', () => {
    const all = new Set(Array.from({ length: 18 }, (_, i) => i + 1));
    const states = Array.from({ length: 18 }, (_, i) =>
      holeCellState(i + 1, 10, all),
    );
    expect(states).not.toContain('missed');
  });
});
