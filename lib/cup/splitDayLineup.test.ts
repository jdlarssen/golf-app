import { describe, it, expect } from 'vitest';
import { generateSplitDayPlan, type CupPlayer, type PlannedBundleMatch } from './cupPairing';
import {
  groupBundleMatchesByFlight,
  swapFlightSinglesPairing,
  swapFlightPlayer,
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

describe('swapFlightPlayer', () => {
  // team('N', [5,10,15,20]) sorted by handicap is already N1..N4 in order,
  // same for S — so pickSide's [rank_i, rank_(len-1-i)] pairing gives:
  //   flight1: side1=[N1,N4] side2=[S1,S4] — singles1 N1×S1, singles2 N4×S4
  //   flight2: side1=[N2,N3] side2=[S2,S3] — singles1 N2×S2, singles2 N3×S3
  function twoFlightPlan(): PlannedBundleMatch[] {
    const t1 = team('N', [5, 10, 15, 20]);
    const t2 = team('S', [6, 11, 16, 21]);
    return generateSplitDayPlan({ team1: t1, team2: t2, strategy: 'handicap' });
  }

  it('swap across flights: exchanges the two players and follows them into singles', () => {
    const plan = twoFlightPlan();

    // N2 (flight2, side1 slot0) picked for flight1's side1 slot0 (currently N1).
    const swapped = swapFlightPlayer(plan, 1, 'side1', 0, 'N2');
    const flights = groupBundleMatchesByFlight(swapped);
    const f1 = flights.find((f) => f.flightIndex === 1)!;
    const f2 = flights.find((f) => f.flightIndex === 2)!;

    expect(f1.greensome.side1).toEqual(['N2', 'N4']);
    expect(f1.bestBall.side1).toEqual(['N2', 'N4']);
    expect(f2.greensome.side1).toEqual(['N1', 'N3']);
    expect(f2.bestBall.side1).toEqual(['N1', 'N3']);

    // side2 (the other team) is completely untouched.
    expect(f1.greensome.side2).toEqual(['S1', 'S4']);
    expect(f2.greensome.side2).toEqual(['S2', 'S3']);

    // Singles pairings follow the swapped players by identity, not index.
    expect(f1.singles[0].side1).toEqual(['N2']);
    expect(f1.singles[0].side2).toEqual(['S1']);
    expect(f1.singles[1].side1).toEqual(['N4']); // untouched slot
    expect(f2.singles[0].side1).toEqual(['N1']);
    expect(f2.singles[1].side1).toEqual(['N3']); // untouched slot

    // ids/labels are stable — only side1/side2 content changed.
    expect(f1.greensome.id).toBe('greensome_matchplay-1');
    expect(f1.singles[0].label).toBe('Singel 1');
  });

  it('swap within a flight: swaps the pair order, only affects that flight\'s singles pairing', () => {
    const plan = twoFlightPlan();

    // S4 (flight1, side2 slot1) picked for flight1's side2 slot0 (currently S1).
    const swapped = swapFlightPlayer(plan, 1, 'side2', 0, 'S4');
    const flights = groupBundleMatchesByFlight(swapped);
    const f1 = flights.find((f) => f.flightIndex === 1)!;
    const f2 = flights.find((f) => f.flightIndex === 2)!;

    expect(f1.greensome.side2).toEqual(['S4', 'S1']);
    expect(f1.bestBall.side2).toEqual(['S4', 'S1']);
    // The pair itself is semantically unchanged (same two players) — only
    // the singles pairing that keys off slot index shifts.
    expect(f1.singles[0].side2).toEqual(['S4']);
    expect(f1.singles[1].side2).toEqual(['S1']);
    expect(f1.singles[0].side1).toEqual(['N1']); // side1 untouched

    // Other flight untouched entirely.
    expect(f2).toEqual(groupBundleMatchesByFlight(plan).find((f) => f.flightIndex === 2));
  });

  it('no-op when picking the player already in the slot', () => {
    const plan = twoFlightPlan();
    expect(swapFlightPlayer(plan, 1, 'side1', 0, 'N1')).toEqual(plan);
  });

  it('no-op when the picked player is not flighted (bye / unknown id)', () => {
    const plan = twoFlightPlan();
    expect(swapFlightPlayer(plan, 1, 'side1', 0, 'N-bye')).toEqual(plan);
  });

  it('no-op when the target flight does not exist', () => {
    const plan = twoFlightPlan();
    expect(swapFlightPlayer(plan, 99, 'side1', 0, 'N2')).toEqual(plan);
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
