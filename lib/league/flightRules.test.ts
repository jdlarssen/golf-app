import { describe, it, expect } from 'vitest';
import { minFlightPlayers, meetsFlightMinimum } from './flightRules';

describe('minFlightPlayers', () => {
  it('a regular league needs a marker: two players', () => {
    expect(minFlightPlayers(false)).toBe(2);
  });

  it('a simulator league lets a player take the round alone', () => {
    expect(minFlightPlayers(true)).toBe(1);
  });
});

describe('meetsFlightMinimum: the gate and the count use the same bound', () => {
  it.each([
    { isSimulator: false, count: 0, ok: false },
    { isSimulator: false, count: 1, ok: false },
    { isSimulator: false, count: 2, ok: true },
    { isSimulator: false, count: 4, ok: true },
    { isSimulator: true, count: 0, ok: false },
    { isSimulator: true, count: 1, ok: true },
    { isSimulator: true, count: 3, ok: true },
  ])('simulator=$isSimulator, $count players → $ok', ({ isSimulator, count, ok }) => {
    expect(meetsFlightMinimum(count, isSimulator)).toBe(ok);
    // The bound is the boundary: one fewer than the minimum never passes.
    expect(meetsFlightMinimum(minFlightPlayers(isSimulator) - 1, isSimulator)).toBe(false);
  });
});
