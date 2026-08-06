import { describe, it, expect } from 'vitest';
import {
  generateCupPlan,
  generateSplitDayPlan,
  cupMatchLabel,
  type CupPlayer,
  type Rng,
} from './cupPairing';
import { buildSessions, CUP_PRESETS } from './cupTemplates';

/** Build a team of N players with deterministic ids + handicaps. */
function team(prefix: string, hcps: number[]): CupPlayer[] {
  return hcps.map((h, i) => ({
    userId: `${prefix}${i + 1}`,
    name: `${prefix}${i + 1}`,
    hcpIndex: h,
  }));
}

/** Deterministic rng cycling through a fixed sequence in [0,1). */
function seededRng(seq: number[]): Rng {
  let i = 0;
  return () => seq[i++ % seq.length];
}

describe('cupMatchLabel', () => {
  it.each([
    ['singles_matchplay', 1, 'Singel 1'],
    ['fourball_matchplay', 2, 'Four-ball 2'],
    ['foursomes_matchplay', 3, 'Foursome 3'],
    // #663: new 2v2 formats
    ['greensome_matchplay', 1, 'Greensome 1'],
    ['chapman_matchplay', 2, 'Chapman 2'],
    ['gruesome_matchplay', 3, 'Gruesome 3'],
    // #1441: best_ball is the split-day host match — not a CupSessionFormat
    // member (see PlannedBundleMatch), but cupMatchLabel accepts the wider
    // CupBundleFormat so the bundle generator can reuse this helper.
    ['best_ball', 1, 'Best ball 1'],
  ] as const)('%s #%i → %s', (format, n, expected) => {
    expect(cupMatchLabel(format, n)).toBe(expected);
  });
});

describe('generateCupPlan — singles', () => {
  it('one match per player, all used once, labelled in order', () => {
    const t1 = team('A', [5, 10, 15, 20]);
    const t2 = team('B', [6, 11, 16, 21]);
    const plan = generateCupPlan({
      team1: t1,
      team2: t2,
      sessions: [{ format: 'singles_matchplay', matchCount: 4 }],
      strategy: 'handicap',
    });
    expect(plan).toHaveLength(4);
    expect(plan.map((m) => m.label)).toEqual(['Singel 1', 'Singel 2', 'Singel 3', 'Singel 4']);
    // every team1 player used exactly once
    const used1 = plan.flatMap((m) => m.side1).sort();
    expect(used1).toEqual(['A1', 'A2', 'A3', 'A4']);
    // each match is 1v1
    for (const m of plan) {
      expect(m.side1).toHaveLength(1);
      expect(m.side2).toHaveLength(1);
    }
  });

  // #1441 (D1/D2): every match generateCupPlan emits carries `segment: 'full'`
  // — the three pre-existing presets don't use front9/back9 splitting, only
  // the splittet-cup-dag bundle (generateSplitDayPlan) does.
  it('#1441: tags every match with segment "full" (regression baseline for existing presets)', () => {
    const t1 = team('A', [5, 10, 15, 20]);
    const t2 = team('B', [6, 11, 16, 21]);
    const plan = generateCupPlan({
      team1: t1,
      team2: t2,
      sessions: [{ format: 'singles_matchplay', matchCount: 4 }],
      strategy: 'handicap',
    });
    expect(plan.every((m) => m.segment === 'full')).toBe(true);
  });

  it('handicap strategy pairs equal ranks across teams', () => {
    const t1 = team('A', [20, 5, 15, 10]); // unsorted on purpose
    const t2 = team('B', [11, 21, 6, 16]);
    const plan = generateCupPlan({
      team1: t1,
      team2: t2,
      sessions: [{ format: 'singles_matchplay', matchCount: 4 }],
      strategy: 'handicap',
    });
    // sorted asc: A2(5),A4(10),A3(15),A1(20) vs B3(6),B1(11),B4(16),B2(21)
    expect(plan.map((m) => [m.side1[0], m.side2[0]])).toEqual([
      ['A2', 'B3'],
      ['A4', 'B1'],
      ['A3', 'B4'],
      ['A1', 'B2'],
    ]);
  });
});

describe('generateCupPlan — 2v2 formats', () => {
  it('foursomes: 2 players per side, all used once within session', () => {
    const t1 = team('A', [5, 10, 15, 20]);
    const t2 = team('B', [6, 11, 16, 21]);
    const plan = generateCupPlan({
      team1: t1,
      team2: t2,
      sessions: [{ format: 'foursomes_matchplay', matchCount: 2 }],
      strategy: 'handicap',
    });
    expect(plan).toHaveLength(2);
    for (const m of plan) {
      expect(m.side1).toHaveLength(2);
      expect(m.side2).toHaveLength(2);
    }
    const used1 = plan.flatMap((m) => m.side1).sort();
    expect(used1).toEqual(['A1', 'A2', 'A3', 'A4']);
  });

  it('handicap strategy pairs strong+weak within a side', () => {
    const t1 = team('A', [5, 10, 15, 20]); // sorted: A1,A2,A3,A4
    const t2 = team('B', [6, 11, 16, 21]);
    const plan = generateCupPlan({
      team1: t1,
      team2: t2,
      sessions: [{ format: 'fourball_matchplay', matchCount: 2 }],
      strategy: 'handicap',
    });
    // high+low: pair0 = (A1, A4), pair1 = (A2, A3)
    expect(plan[0].side1.sort()).toEqual(['A1', 'A4']);
    expect(plan[1].side1.sort()).toEqual(['A2', 'A3']);
  });

  // #663: greensome/chapman/gruesome reuse the foursomes pairing path (2 per side)
  it.each([
    ['greensome_matchplay', 'Greensome'],
    ['chapman_matchplay', 'Chapman'],
    ['gruesome_matchplay', 'Gruesome'],
  ] as const)(
    '%s: 2 players per side, correct label prefix, all used once',
    (format, labelPrefix) => {
      const t1 = team('A', [5, 10, 15, 20]);
      const t2 = team('B', [6, 11, 16, 21]);
      const plan = generateCupPlan({
        team1: t1,
        team2: t2,
        sessions: [{ format, matchCount: 2 }],
        strategy: 'handicap',
      });
      expect(plan).toHaveLength(2);
      for (const m of plan) {
        expect(m.side1).toHaveLength(2);
        expect(m.side2).toHaveLength(2);
        expect(m.label).toMatch(new RegExp(`^${labelPrefix} \\d+$`));
      }
      const used1 = plan.flatMap((m) => m.side1).sort();
      expect(used1).toEqual(['A1', 'A2', 'A3', 'A4']);
    },
  );
});

describe('generateCupPlan — sessions + reuse', () => {
  it('reuses players across sessions but never within a session', () => {
    const t1 = team('A', [5, 10, 15, 20]);
    const t2 = team('B', [6, 11, 16, 21]);
    const klassisk = CUP_PRESETS.find((p) => p.id === 'klassisk')!;
    const sessions = buildSessions(klassisk.sessions, 4);
    const plan = generateCupPlan({ team1: t1, team2: t2, sessions, strategy: 'handicap' });

    // 2 + 2 + 4 = 8 matches
    expect(plan).toHaveLength(8);

    // labels per format, restarting numbering per format
    expect(plan.map((m) => m.label)).toEqual([
      'Foursome 1',
      'Foursome 2',
      'Four-ball 1',
      'Four-ball 2',
      'Singel 1',
      'Singel 2',
      'Singel 3',
      'Singel 4',
    ]);

    // within each format-session: team1 players distinct
    const foursomes = plan.filter((m) => m.format === 'foursomes_matchplay');
    const fUsed = foursomes.flatMap((m) => m.side1);
    expect(new Set(fUsed).size).toBe(fUsed.length);

    // across sessions: A1 appears in foursomes AND singles (reuse)
    const a1Matches = plan.filter((m) => m.side1.includes('A1'));
    expect(a1Matches.length).toBeGreaterThan(1);
  });

  it('match ids are unique within a plan', () => {
    const t1 = team('A', [5, 10, 15, 20]);
    const t2 = team('B', [6, 11, 16, 21]);
    const sessions = buildSessions(['foursomes_matchplay', 'singles_matchplay'], 4);
    const plan = generateCupPlan({ team1: t1, team2: t2, sessions, strategy: 'handicap' });
    const ids = plan.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('generateCupPlan — odd rosters + clamping', () => {
  it('odd team size leaves a bye in 2v2 (uses floor(size/2) pairs)', () => {
    const t1 = team('A', [5, 10, 15, 20, 25]); // 5 players
    const t2 = team('B', [6, 11, 16, 21, 26]);
    const plan = generateCupPlan({
      team1: t1,
      team2: t2,
      sessions: [{ format: 'foursomes_matchplay', matchCount: 2 }],
      strategy: 'handicap',
    });
    expect(plan).toHaveLength(2);
    const used1 = plan.flatMap((m) => m.side1);
    expect(used1).toHaveLength(4); // one player benched
    expect(new Set(used1).size).toBe(4);
  });

  it('clamps matchCount to what the smaller team can field', () => {
    const t1 = team('A', [5, 10, 15, 20]); // 4
    const t2 = team('B', [6, 11]); // 2 → only 1 foursome possible
    const plan = generateCupPlan({
      team1: t1,
      team2: t2,
      sessions: [{ format: 'foursomes_matchplay', matchCount: 2 }],
      strategy: 'handicap',
    });
    expect(plan).toHaveLength(1);
  });

  it('drops a session entirely when neither byes nor pairs are possible', () => {
    const t1 = team('A', [5]);
    const t2 = team('B', [6]);
    const plan = generateCupPlan({
      team1: t1,
      team2: t2,
      sessions: [{ format: 'foursomes_matchplay', matchCount: 1 }],
      strategy: 'handicap',
    });
    expect(plan).toHaveLength(0);
  });
});

describe('generateCupPlan — random determinism', () => {
  it('same rng sequence → identical plan', () => {
    const t1 = team('A', [5, 10, 15, 20]);
    const t2 = team('B', [6, 11, 16, 21]);
    const sessions = buildSessions(['singles_matchplay'], 4);
    const make = () =>
      generateCupPlan({
        team1: t1,
        team2: t2,
        sessions,
        strategy: 'random',
        rng: seededRng([0.42, 0.1, 0.9, 0.3, 0.7, 0.2]),
      });
    expect(make()).toEqual(make());
  });

  it('random still produces a valid 1-per-player partition', () => {
    const t1 = team('A', [5, 10, 15, 20]);
    const t2 = team('B', [6, 11, 16, 21]);
    const plan = generateCupPlan({
      team1: t1,
      team2: t2,
      sessions: buildSessions(['singles_matchplay'], 4),
      strategy: 'random',
      rng: seededRng([0.8, 0.2, 0.5, 0.1, 0.6, 0.33]),
    });
    expect(plan.flatMap((m) => m.side1).sort()).toEqual(['A1', 'A2', 'A3', 'A4']);
    expect(plan.flatMap((m) => m.side2).sort()).toEqual(['B1', 'B2', 'B3', 'B4']);
  });
});

// #1441 — splittet cup-dag: per flight (2v2) genereres en bunt av 4 matcher
// (greensome front9 + best ball back9-host + 2 avledede singles back9), alle
// spilt av de samme fire fysiske spillerne. Se docs/plans/2026-08-06-splittet-
// cup-dag-design.md D4.
describe('generateSplitDayPlan — splittet cup-dag-bunt', () => {
  it('6v6 handicap: 3 flights × 4 matches, riktig rekkefølge/segment/sourceId/label', () => {
    const t1 = team('A', [2, 8, 14, 20, 26, 32]);
    const t2 = team('B', [3, 9, 15, 21, 27, 33]);
    const plan = generateSplitDayPlan({ team1: t1, team2: t2, strategy: 'handicap' });

    expect(plan).toHaveLength(12); // 3 flights × 4

    // Grouped by flight: 4 matches per flightIndex, in emission order
    // greensome → best ball (host) → singles × 2.
    for (let flight = 1; flight <= 3; flight++) {
      const flightMatches = plan.filter((m) => m.flightIndex === flight);
      expect(flightMatches).toHaveLength(4);
      const [greensome, bestBall, singles1, singles2] = flightMatches;

      expect(greensome.format).toBe('greensome_matchplay');
      expect(greensome.segment).toBe('front9');
      expect(greensome.label).toBe(`Greensome ${flight}`);
      expect(greensome.sourceId).toBeUndefined();

      expect(bestBall.format).toBe('best_ball');
      expect(bestBall.segment).toBe('back9');
      expect(bestBall.label).toBe(`Best ball ${flight}`);
      expect(bestBall.sourceId).toBeUndefined();

      expect(singles1.format).toBe('singles_matchplay');
      expect(singles1.segment).toBe('back9');
      expect(singles1.sourceId).toBe(bestBall.id);
      expect(singles2.format).toBe('singles_matchplay');
      expect(singles2.segment).toBe('back9');
      expect(singles2.sourceId).toBe(bestBall.id);

      // Same 4 physical players across all 4 matches in the flight.
      const flightPlayers = new Set([...greensome.side1, ...greensome.side2]);
      expect(flightPlayers.size).toBe(4);
      expect(new Set([...bestBall.side1, ...bestBall.side2])).toEqual(flightPlayers);
      const singlesPlayers = new Set([
        ...singles1.side1,
        ...singles1.side2,
        ...singles2.side1,
        ...singles2.side2,
      ]);
      expect(singlesPlayers).toEqual(flightPlayers);

      // Singles pair within the flight: rank1 vs rank1, rank2 vs rank2.
      expect(singles1.side1).toEqual([greensome.side1[0]]);
      expect(singles1.side2).toEqual([greensome.side2[0]]);
      expect(singles2.side1).toEqual([greensome.side1[1]]);
      expect(singles2.side2).toEqual([greensome.side2[1]]);
    }

    // Singles labels number consecutively across all flights (1..6), not
    // restarted per flight — same convention as cupMatchLabel's format counter.
    const singlesLabels = plan.filter((m) => m.format === 'singles_matchplay').map((m) => m.label);
    expect(singlesLabels).toEqual(['Singel 1', 'Singel 2', 'Singel 3', 'Singel 4', 'Singel 5', 'Singel 6']);
  });

  it('handicap strategy pairs strong+weak within a side, per flight', () => {
    const t1 = team('A', [2, 8, 14, 20]); // sorted: A1,A2,A3,A4
    const t2 = team('B', [3, 9, 15, 21]);
    const plan = generateSplitDayPlan({ team1: t1, team2: t2, strategy: 'handicap' });
    const flight1 = plan.filter((m) => m.flightIndex === 1);
    const [greensome] = flight1;
    // pickSide handicap semantics: rank i + rank (len-1-i) → [A1, A4] for i=0.
    expect(greensome.side1).toEqual(['A1', 'A4']);
    expect(greensome.side2).toEqual(['B1', 'B4']);
  });

  it('odd team size (5 per side) clamps to floor(5/2) = 2 flights, 1 bye per side', () => {
    const t1 = team('A', [2, 8, 14, 20, 26]);
    const t2 = team('B', [3, 9, 15, 21, 27]);
    const plan = generateSplitDayPlan({ team1: t1, team2: t2, strategy: 'handicap' });
    expect(plan).toHaveLength(8); // 2 flights × 4
    const usedSide1 = new Set(plan.flatMap((m) => m.side1));
    // Bundle matches reuse the same flight-pair for greensome/best_ball/singles,
    // so the DISTINCT side1 players used across the whole plan is still 4
    // (2 flights × 2 players). Handicap strong+weak pairing (pickSide, same
    // semantics as the pre-existing 2v2 odd-team-size test) benches the
    // MIDDLE-ranked player (A3, index 2 of 5) — pair0 = [A1,A5], pair1 = [A2,A4].
    expect(usedSide1.size).toBe(4);
    expect(usedSide1.has('A3')).toBe(false);
  });

  it('too few players per side (1 per side) → empty plan (no flight possible)', () => {
    const t1 = team('A', [2]);
    const t2 = team('B', [3]);
    const plan = generateSplitDayPlan({ team1: t1, team2: t2, strategy: 'handicap' });
    expect(plan).toHaveLength(0);
  });

  it('random strategy: same rng sequence → identical plan (determinism)', () => {
    const t1 = team('A', [2, 8, 14, 20]);
    const t2 = team('B', [3, 9, 15, 21]);
    const make = () =>
      generateSplitDayPlan({
        team1: t1,
        team2: t2,
        strategy: 'random',
        rng: seededRng([0.42, 0.1, 0.9, 0.3, 0.7, 0.2]),
      });
    expect(make()).toEqual(make());
  });

  it('match ids are unique within the plan', () => {
    const t1 = team('A', [2, 8, 14, 20, 26, 32]);
    const t2 = team('B', [3, 9, 15, 21, 27, 33]);
    const plan = generateSplitDayPlan({ team1: t1, team2: t2, strategy: 'handicap' });
    const ids = plan.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
