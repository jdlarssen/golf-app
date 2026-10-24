import { describe, it, expect } from 'vitest';
import { MAX_FLIGHT_SIZE } from '@/lib/games/flightScope';
import {
  MAX_CO_PLAYERS,
  MAX_FLIGHT_PLAYERS,
  flightSizeRefusal,
  minFlightPlayers,
  meetsFlightMinimum,
} from './flightRules';

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

describe('the most players in a league flight (the orchestrator\'s review)', () => {
  it('is the physical flight on the course, MAX_FLIGHT_SIZE, with room for the player', () => {
    // flightRules imports nothing (the app reads it by path), so the bound is
    // its own constant here, locked to lib/games/flightScope.ts.
    expect({ players: MAX_FLIGHT_PLAYERS, coPlayers: MAX_CO_PLAYERS }).toEqual({
      players: MAX_FLIGHT_SIZE,
      coPlayers: MAX_FLIGHT_SIZE - 1,
    });
  });
});

describe('flightSizeRefusal: both bounds in one call', () => {
  it.each([
    { isSimulator: true, count: 1, refusal: null },
    { isSimulator: true, count: 4, refusal: null },
    { isSimulator: true, count: 5, refusal: 'flight_too_large' },
    { isSimulator: false, count: 1, refusal: 'need_marker' },
    { isSimulator: false, count: 2, refusal: null },
    { isSimulator: false, count: 5, refusal: 'flight_too_large' },
  ])('simulator=$isSimulator, $count players → $refusal', ({ isSimulator, count, refusal }) => {
    expect(flightSizeRefusal(count, isSimulator)).toBe(refusal);
  });
});
