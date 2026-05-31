import { describe, it, expect } from 'vitest';
import { generateCupPlan, cupMatchLabel, type CupPlayer, type Rng } from './cupPairing';
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
