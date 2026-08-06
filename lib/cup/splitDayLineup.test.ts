import { describe, it, expect } from 'vitest';
import { generateSplitDayPlan, type CupPlayer } from './cupPairing';
import {
  groupBundleMatchesByFlight,
  swapFlightSinglesPairing,
  splitDayFlightCount,
  splitDayTotalMatches,
} from './splitDayLineup';

function team(prefix: string, hcps: number[]): CupPlayer[] {
  return hcps.map((h, i) => ({
    userId: `${prefix}${i + 1}`,
    name: `${prefix}${i + 1}`,
    hcpIndex: h,
  }));
}

describe('groupBundleMatchesByFlight', () => {
  it('groups the 4-match bundle per flight, sorted by flightIndex', () => {
    const t1 = team('N', [5, 10, 15, 20]);
    const t2 = team('S', [6, 11, 16, 21]);
    const plan = generateSplitDayPlan({ team1: t1, team2: t2, strategy: 'handicap' });

    const flights = groupBundleMatchesByFlight(plan);

    expect(flights).toHaveLength(2);
    expect(flights.map((f) => f.flightIndex)).toEqual([1, 2]);
    for (const f of flights) {
      expect(f.greensome.format).toBe('greensome_matchplay');
      expect(f.greensome.segment).toBe('front9');
      expect(f.bestBall.format).toBe('best_ball');
      expect(f.bestBall.segment).toBe('back9');
      expect(f.singles).toHaveLength(2);
      for (const s of f.singles) {
        expect(s.format).toBe('singles_matchplay');
        expect(s.sourceId).toBe(f.bestBall.id);
      }
    }
  });

  it('skips a flight missing a required match (defensive, malformed input)', () => {
    const t1 = team('N', [5, 10]);
    const t2 = team('S', [6, 11]);
    const plan = generateSplitDayPlan({ team1: t1, team2: t2, strategy: 'handicap' });
    const broken = plan.filter((m) => m.format !== 'best_ball');

    expect(groupBundleMatchesByFlight(broken)).toEqual([]);
  });

  it('empty input → empty output', () => {
    expect(groupBundleMatchesByFlight([])).toEqual([]);
  });
});

describe('swapFlightSinglesPairing', () => {
  it('swaps side2 between the two singles matches in the target flight only', () => {
    const t1 = team('N', [5, 10, 15, 20]);
    const t2 = team('S', [6, 11, 16, 21]);
    const plan = generateSplitDayPlan({ team1: t1, team2: t2, strategy: 'handicap' });
    const before = groupBundleMatchesByFlight(plan);
    const flight1Before = before.find((f) => f.flightIndex === 1)!;
    const [s1Before, s2Before] = flight1Before.singles;

    const swapped = swapFlightSinglesPairing(plan, 1);
    const after = groupBundleMatchesByFlight(swapped);
    const flight1After = after.find((f) => f.flightIndex === 1)!;
    const flight2After = after.find((f) => f.flightIndex === 2)!;
    const flight2Before = before.find((f) => f.flightIndex === 2)!;

    // side1 (rank identity) unchanged; side2 swapped between the two matches.
    expect(flight1After.singles[0].side1).toEqual(s1Before.side1);
    expect(flight1After.singles[0].side2).toEqual(s2Before.side2);
    expect(flight1After.singles[1].side1).toEqual(s2Before.side1);
    expect(flight1After.singles[1].side2).toEqual(s1Before.side2);

    // Other flight untouched.
    expect(flight2After.singles).toEqual(flight2Before.singles);
    // Greensome/best-ball untouched.
    expect(flight1After.greensome).toEqual(flight1Before.greensome);
    expect(flight1After.bestBall).toEqual(flight1Before.bestBall);
  });

  it('swapping twice returns to the original pairing (self-inverse)', () => {
    const t1 = team('N', [5, 10]);
    const t2 = team('S', [6, 11]);
    const plan = generateSplitDayPlan({ team1: t1, team2: t2, strategy: 'handicap' });

    const twice = swapFlightSinglesPairing(swapFlightSinglesPairing(plan, 1), 1);

    expect(twice).toEqual(plan);
  });

  it('no-op when the flightIndex has no singles matches', () => {
    const t1 = team('N', [5, 10]);
    const t2 = team('S', [6, 11]);
    const plan = generateSplitDayPlan({ team1: t1, team2: t2, strategy: 'handicap' });

    expect(swapFlightSinglesPairing(plan, 99)).toEqual(plan);
  });
});

describe('splitDayFlightCount / splitDayTotalMatches', () => {
  it.each([
    [4, 4, 2, 8],
    [5, 4, 2, 8],
    [1, 4, 0, 0],
    [0, 0, 0, 0],
    [12, 12, 6, 24],
  ])('team1=%i team2=%i → %i flights, %i matches', (t1, t2, flights, total) => {
    expect(splitDayFlightCount(t1, t2)).toBe(flights);
    expect(splitDayTotalMatches(t1, t2)).toBe(total);
  });
});
