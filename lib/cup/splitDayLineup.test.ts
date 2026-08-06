import { describe, it, expect } from 'vitest';
import { generateSplitDayPlan, type CupPlayer, type PlannedBundleMatch } from './cupPairing';
import {
  groupBundleMatchesByFlight,
  swapFlightSinglesPairing,
  swapFlightPlayer,
  splitDayFlightCount,
  splitDayTotalMatches,
  resolveScheduledTeeOffAt,
  getFlightMatchupRows,
  FLIGHT_TEE_OFF_STAGGER_MINUTES,
} from './splitDayLineup';

function team(prefix: string, hcps: number[]): CupPlayer[] {
  return hcps.map((h, i) => ({
    userId: `${prefix}${i + 1}`,
    name: `${prefix}${i + 1}`,
    hcpIndex: h,
  }));
}

// team('N', [5,10,15,20]) sorted by handicap is already N1..N4 in order,
// same for S — so pickSide's [rank_i, rank_(len-1-i)] pairing gives:
//   flight1: side1=[N1,N4] side2=[S1,S4] — singles1 N1×S1, singles2 N4×S4
//   flight2: side1=[N2,N3] side2=[S2,S3] — singles1 N2×S2, singles2 N3×S3
// Shared fixture (moved to module scope, #1441 F3e) — used by
// `swapFlightPlayer`, `getFlightMatchupRows` and the reachability suite below.
function twoFlightPlan(): PlannedBundleMatch[] {
  const t1 = team('N', [5, 10, 15, 20]);
  const t2 = team('S', [6, 11, 16, 21]);
  return generateSplitDayPlan({ team1: t1, team2: t2, strategy: 'handicap' });
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

  // #1441 (owner-QA rebuild F3e): «det er ikke mulig å bytte pairing til
  // pairingen jeg ønsker». Proof-by-construction that every possible
  // arrangement of one team's 4 players across the wizard's 4 flight-slots
  // is reachable purely through successive dropdown picks — a plain
  // selection-sort-via-swap walk (fix slot 0, then 1, then 2, then 3) always
  // reaches the target, because `swapFlightPlayer` swaps BY IDENTITY: the
  // target for a not-yet-fixed slot can only ever be sitting in another
  // not-yet-fixed slot (already-fixed slots are never revisited by a later
  // step, since a swap only touches the slot being fixed and wherever its
  // target currently sits).
  describe('full reachability of every team1 arrangement (owner-QA)', () => {
    function permutations<T>(arr: T[]): T[][] {
      if (arr.length <= 1) return [arr.slice()];
      const out: T[][] = [];
      for (let i = 0; i < arr.length; i++) {
        const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
        for (const p of permutations(rest)) out.push([arr[i], ...p]);
      }
      return out;
    }

    const POSITIONS: { flightIndex: number; slotIndex: 0 | 1 }[] = [
      { flightIndex: 1, slotIndex: 0 },
      { flightIndex: 1, slotIndex: 1 },
      { flightIndex: 2, slotIndex: 0 },
      { flightIndex: 2, slotIndex: 1 },
    ];

    // Each permutation wrapped in a single-element tuple — `it.each`'s
    // array-of-arrays form spreads a row across positional params, and this
    // callback wants the whole permutation as ONE `target` argument.
    it.each(permutations(['N1', 'N2', 'N3', 'N4']).map((p) => [p]))(
      'reaches arrangement %j across the two flights via successive slot picks',
      (target) => {
        let matches = twoFlightPlan();
        for (let i = 0; i < POSITIONS.length; i++) {
          const { flightIndex, slotIndex } = POSITIONS[i];
          matches = swapFlightPlayer(matches, flightIndex, 'side1', slotIndex, target[i]);
        }
        const flights = groupBundleMatchesByFlight(matches);
        const f1 = flights.find((f) => f.flightIndex === 1)!;
        const f2 = flights.find((f) => f.flightIndex === 2)!;
        expect([
          f1.greensome.side1[0],
          f1.greensome.side1[1],
          f2.greensome.side1[0],
          f2.greensome.side1[1],
        ]).toEqual(target);
        // side2 (the other team) was never touched by these side1-only picks.
        expect(f1.greensome.side2).toEqual(['S1', 'S4']);
        expect(f2.greensome.side2).toEqual(['S2', 'S3']);
      },
    );
  });
});

describe('getFlightMatchupRows', () => {
  it('pairs side1[slotIndex] with side2[slotIndex] — the singles opponents on the same row', () => {
    const flights = groupBundleMatchesByFlight(twoFlightPlan());
    const f1 = flights.find((f) => f.flightIndex === 1)!;
    const rows = getFlightMatchupRows(f1);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      slotIndex: 0,
      side1PlayerId: 'N1',
      side2PlayerId: 'S1',
      singlesMatchId: f1.singles[0].id,
    });
    expect(rows[1]).toEqual({
      slotIndex: 1,
      side1PlayerId: 'N4',
      side2PlayerId: 'S4',
      singlesMatchId: f1.singles[1].id,
    });
  });

  it('stays aligned with the singles pairing after a within-flight slot pick', () => {
    const swapped = swapFlightPlayer(twoFlightPlan(), 1, 'side2', 0, 'S4');
    const f1 = groupBundleMatchesByFlight(swapped).find((f) => f.flightIndex === 1)!;
    const rows = getFlightMatchupRows(f1);

    expect([rows[0].side1PlayerId, rows[0].side2PlayerId]).toEqual(['N1', 'S4']);
    expect([rows[1].side1PlayerId, rows[1].side2PlayerId]).toEqual(['N4', 'S1']);
  });

  // #1441 (owner-QA rebuild F3e): both singles-pairing arrangements for a
  // fixed foursome are reachable via a same-team row pick — exactly the
  // dropdown interaction the flight card wires to `onSwapPlayer`.
  it('both singles-pairing arrangements for a flight are reachable via a same-team row pick', () => {
    const plan = twoFlightPlan();
    const before = getFlightMatchupRows(groupBundleMatchesByFlight(plan).find((f) => f.flightIndex === 1)!);
    expect([before[0].side1PlayerId, before[0].side2PlayerId]).toEqual(['N1', 'S1']);
    expect([before[1].side1PlayerId, before[1].side2PlayerId]).toEqual(['N4', 'S4']);

    // Row 0's side2 slot picks row 1's current side2 occupant (S4).
    const swapped = swapFlightPlayer(plan, 1, 'side2', 0, 'S4');
    const after = getFlightMatchupRows(groupBundleMatchesByFlight(swapped).find((f) => f.flightIndex === 1)!);
    expect([after[0].side1PlayerId, after[0].side2PlayerId]).toEqual(['N1', 'S4']);
    expect([after[1].side1PlayerId, after[1].side2PlayerId]).toEqual(['N4', 'S1']);
  });
});

describe('resolveScheduledTeeOffAt', () => {
  const cupStart = '2026-08-15T07:00:00.000Z';

  it('absent cup-start → NULL regardless of flight', () => {
    expect(resolveScheduledTeeOffAt(undefined, 1)).toBeNull();
    expect(resolveScheduledTeeOffAt(undefined, 3)).toBeNull();
    expect(resolveScheduledTeeOffAt(undefined, undefined)).toBeNull();
  });

  it('no flight concept (three older presets) → shared, unstaggered cup-start', () => {
    expect(resolveScheduledTeeOffAt(cupStart, undefined)).toBe(cupStart);
  });

  it.each([
    [1, cupStart],
    [2, '2026-08-15T07:10:00.000Z'],
    [3, '2026-08-15T07:20:00.000Z'],
  ])('flight %i → %s', (flightIndex, expected) => {
    expect(resolveScheduledTeeOffAt(cupStart, flightIndex)).toBe(expected);
  });

  it('stagger constant is 10 minutes (owner decision)', () => {
    expect(FLIGHT_TEE_OFF_STAGGER_MINUTES).toBe(10);
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
