import { describe, it, expect } from 'vitest';
import { computeCupPlayerPoints } from './computeCupPlayerPoints';
import type { CupMatchSummary } from './computeCupLeaderboard';
import type { CupRoster, CupSideAwardSnapshot } from './getCupSnapshot';

// Type A (ren logikk, TDD) — per-spiller-poengregnskap for cup. Aggregatoren
// GJENBRUKER pointsTeam1/pointsTeam2 fra CupMatchSummary (regner aldri
// kamppoeng på nytt) og krediterer HELE sidens poeng til hver spiller på siden
// (Ryder Cup-full-kreditt, eierbeslutning #1497). Sidepoeng (ctp/ld)
// krediteres via winnerUserId; gir bidrar aldri.

function roster(overrides: Partial<CupRoster> = {}): CupRoster {
  return {
    team1: [
      { userId: 'p1', name: 'Per', nickname: null },
      { userId: 'p2', name: 'Pål', nickname: null },
    ],
    team2: [
      { userId: 'k1', name: 'Knut', nickname: null },
      { userId: 'k2', name: 'Kari', nickname: null },
    ],
    ...overrides,
  };
}

function match(overrides: Partial<CupMatchSummary> = {}): CupMatchSummary {
  return {
    gameId: 'g1',
    matchLabel: 'Singles 1',
    team1PlayerName: 'Per',
    team2PlayerName: 'Knut',
    status: 'finished',
    result: { winnerSide: 1, formatted: '3&2' },
    team1UserIds: ['p1'],
    team2UserIds: ['k1'],
    pointsTeam1: 1,
    pointsTeam2: 0,
    ...overrides,
  };
}

function ctp(overrides: Partial<Extract<CupSideAwardSnapshot, { kind: 'ctp' | 'ld' }>> = {}): CupSideAwardSnapshot {
  return {
    id: 'sa1',
    kind: 'ctp',
    holeNumber: 7,
    points: 1,
    slot: 1,
    slotCount: 1,
    winnerUserId: 'p1',
    winnerTeam: 1,
    noWinner: false,
    ...overrides,
  };
}

describe('computeCupPlayerPoints', () => {
  it('tom cup (0 kamper, 0 sidepoeng): alle roster-spillere 0 p, sortert på navn', () => {
    const result = computeCupPlayerPoints({ matches: [], roster: roster(), sideAwards: [] });

    // Navn asc med norsk collator (team2 beviser sortering: motsatt av
    // innsettings-rekkefølgen [Knut, Kari] → [Kari, Knut]).
    expect(result.team1.map((r) => r.displayName)).toEqual(['Per', 'Pål']);
    expect(result.team2.map((r) => r.displayName)).toEqual(['Kari', 'Knut']);
    expect(result.team1.every((r) => r.points === 0)).toBe(true);
    expect(result.team1.every((r) => r.contributions.length === 0)).toBe(true);
    expect(result.team2.every((r) => r.points === 0)).toBe(true);
  });

  it('én ferdig singles-kamp, side 1 vant: vinner +win_points, taper 0', () => {
    const result = computeCupPlayerPoints({
      matches: [match({ pointsTeam1: 1, pointsTeam2: 0 })],
      roster: roster(),
      sideAwards: [],
    });

    const per = result.team1.find((r) => r.userId === 'p1')!;
    expect(per.points).toBe(1);
    expect(per.contributions).toEqual([
      {
        type: 'match',
        gameId: 'g1',
        matchLabel: 'Singles 1',
        opponentLabel: 'Knut',
        outcome: 'won',
        points: 1,
      },
    ]);

    // Taperen (k1) og medspillere uten kamp får ingenting.
    expect(result.team2.find((r) => r.userId === 'k1')!.points).toBe(0);
    expect(result.team1.find((r) => r.userId === 'p2')!.points).toBe(0);
  });

  it('spiller i flere kamper: summen av alle kampenes poeng', () => {
    const result = computeCupPlayerPoints({
      matches: [
        match({ gameId: 'g1', team1UserIds: ['p1'], pointsTeam1: 1, pointsTeam2: 0 }),
        match({
          gameId: 'g2',
          matchLabel: 'Singles 2',
          team1UserIds: ['p1'],
          team2UserIds: ['k2'],
          team2PlayerName: 'Kari',
          result: { winnerSide: 1, formatted: '2up' },
          pointsTeam1: 1,
          pointsTeam2: 0,
        }),
      ],
      roster: roster(),
      sideAwards: [],
    });

    const per = result.team1.find((r) => r.userId === 'p1')!;
    expect(per.points).toBe(2);
    expect(per.contributions).toHaveLength(2);
    expect(per.contributions.map((c) => c.type)).toEqual(['match', 'match']);
  });

  it.each([
    { winPoints: 2, tiePoints: 1, label: 'win=2/tie=1' },
    { winPoints: 5, tiePoints: 2, label: 'win=5/tie=2' },
  ])('vektede poeng $label: fulle vektede verdier krediteres, aldri 1/0,5', ({ winPoints, tiePoints }) => {
    const result = computeCupPlayerPoints({
      matches: [
        match({ gameId: 'g1', pointsTeam1: winPoints, pointsTeam2: 0 }),
        match({
          gameId: 'g2',
          result: { winnerSide: 'tied', formatted: 'AS' },
          pointsTeam1: tiePoints,
          pointsTeam2: tiePoints,
        }),
      ],
      roster: roster(),
      sideAwards: [],
    });

    // p1 spiller begge (win + tie) → winPoints + tiePoints.
    const per = result.team1.find((r) => r.userId === 'p1')!;
    expect(per.points).toBe(Math.round((winPoints + tiePoints) * 10) / 10);
    // k1 spiller begge (tap + tie) → 0 + tiePoints.
    const knut = result.team2.find((r) => r.userId === 'k1')!;
    expect(knut.points).toBe(tiePoints);
  });

  it('delt lagkamp: BEGGE i paret får hele tie_points (ikke 0,5/0,5-deling)', () => {
    const result = computeCupPlayerPoints({
      matches: [
        match({
          gameId: 'g1',
          team1UserIds: ['p1', 'p2'],
          team2UserIds: ['k1', 'k2'],
          gameMode: 'fourball_matchplay',
          result: { winnerSide: 'tied', formatted: 'AS' },
          pointsTeam1: 1,
          pointsTeam2: 1,
        }),
      ],
      roster: roster(),
      sideAwards: [],
    });

    // Begge på lag 1 får HELE tie_points (1), ikke 0,5.
    expect(result.team1.find((r) => r.userId === 'p1')!.points).toBe(1);
    expect(result.team1.find((r) => r.userId === 'p2')!.points).toBe(1);
    expect(result.team2.find((r) => r.userId === 'k1')!.points).toBe(1);
    expect(result.team2.find((r) => r.userId === 'k2')!.points).toBe(1);
    // Utfall = tied for alle.
    expect(result.team1.find((r) => r.userId === 'p1')!.contributions[0]).toMatchObject({
      type: 'match',
      outcome: 'tied',
      opponentLabel: 'Knut',
      points: 1,
    });
  });

  it('lik totalsum: deterministisk rekkefølge (poeng desc, navn asc)', () => {
    const result = computeCupPlayerPoints({
      matches: [
        // Begge får 1 poeng → sorteres på navn. Roster settes inn som
        // [Bård(p1), Anders(p2)] slik at navn-sortering (Anders < Bård) beviselig
        // overstyrer innsettings-rekkefølgen.
        match({ gameId: 'g1', team1UserIds: ['p1'], pointsTeam1: 1, pointsTeam2: 0 }),
        match({ gameId: 'g2', team1UserIds: ['p2'], pointsTeam1: 1, pointsTeam2: 0 }),
      ],
      roster: roster({
        team1: [
          { userId: 'p1', name: 'Bård', nickname: null },
          { userId: 'p2', name: 'Anders', nickname: null },
        ],
      }),
      sideAwards: [],
    });

    expect(result.team1.map((r) => r.userId)).toEqual(['p2', 'p1']); // Anders før Bård
    expect(result.team1.map((r) => r.points)).toEqual([1, 1]);
  });

  it('poeng desc går foran navn asc i sorteringen', () => {
    const result = computeCupPlayerPoints({
      matches: [
        // Per (p1) får 2, Pål (p2) får 1 → Per øverst tross navn-rekkefølge.
        match({ gameId: 'g1', team1UserIds: ['p1'], pointsTeam1: 1, pointsTeam2: 0 }),
        match({ gameId: 'g2', team1UserIds: ['p1'], pointsTeam1: 1, pointsTeam2: 0 }),
        match({ gameId: 'g3', team1UserIds: ['p2'], pointsTeam1: 1, pointsTeam2: 0 }),
      ],
      roster: roster(),
      sideAwards: [],
    });

    expect(result.team1.map((r) => r.userId)).toEqual(['p1', 'p2']);
    expect(result.team1.map((r) => r.points)).toEqual([2, 1]);
  });

  it('ctp/ld krediteres via winnerUserId på riktig spiller', () => {
    const result = computeCupPlayerPoints({
      matches: [],
      roster: roster(),
      sideAwards: [
        ctp({ id: 'sa1', kind: 'ctp', holeNumber: 7, points: 1, winnerUserId: 'p1', winnerTeam: 1 }),
        ctp({ id: 'sa2', kind: 'ld', holeNumber: 12, points: 2, winnerUserId: 'k2', winnerTeam: 2 }),
      ],
    });

    const per = result.team1.find((r) => r.userId === 'p1')!;
    expect(per.points).toBe(1);
    expect(per.contributions).toEqual([{ type: 'ctp', holeNumber: 7, points: 1 }]);

    const kari = result.team2.find((r) => r.userId === 'k2')!;
    expect(kari.points).toBe(2);
    expect(kari.contributions).toEqual([{ type: 'ld', holeNumber: 12, points: 2 }]);
  });

  it('ctp-vinner utenfor roster / null: ingen spiller-kreditt, ingen crash', () => {
    const result = computeCupPlayerPoints({
      matches: [],
      roster: roster(),
      sideAwards: [
        ctp({ id: 'sa1', winnerUserId: 'ghost', winnerTeam: null }), // ikke i rosteret
        ctp({ id: 'sa2', winnerUserId: null, winnerTeam: null }), // ingen vinner tastet
      ],
    });

    expect(result.team1.every((r) => r.points === 0)).toBe(true);
    expect(result.team2.every((r) => r.points === 0)).toBe(true);
  });

  it('gir-rader bidrar aldri til spillerrader', () => {
    const result = computeCupPlayerPoints({
      matches: [],
      roster: roster(),
      sideAwards: [
        { id: 'sa1', kind: 'gir', holeNumber: 3, points: 1.5, maxPerTeam: 3, team1Count: 2, team2Count: 1 },
      ],
    });

    expect(result.team1.every((r) => r.points === 0)).toBe(true);
    expect(result.team1.every((r) => r.contributions.length === 0)).toBe(true);
    expect(result.team2.every((r) => r.points === 0)).toBe(true);
  });

  it('manglende team1UserIds/team2UserIds: matchens spillere får ingen kamp-kreditt (defensivt)', () => {
    const result = computeCupPlayerPoints({
      matches: [
        match({ team1UserIds: undefined, team2UserIds: undefined, pointsTeam1: 1, pointsTeam2: 0 }),
      ],
      roster: roster(),
      sideAwards: [],
    });

    expect(result.team1.every((r) => r.points === 0)).toBe(true);
  });

  it('avrunder totalsum til nærmeste 0,1 (flyt-presisjon)', () => {
    const result = computeCupPlayerPoints({
      matches: [
        match({ gameId: 'g1', team1UserIds: ['p1'], result: { winnerSide: 'tied', formatted: 'AS' }, pointsTeam1: 0.5, pointsTeam2: 0.5 }),
        match({ gameId: 'g2', team1UserIds: ['p1'], result: { winnerSide: 'tied', formatted: 'AS' }, pointsTeam1: 0.5, pointsTeam2: 0.5 }),
        match({ gameId: 'g3', team1UserIds: ['p1'], result: { winnerSide: 'tied', formatted: 'AS' }, pointsTeam1: 0.5, pointsTeam2: 0.5 }),
      ],
      roster: roster(),
      sideAwards: [],
    });

    expect(result.team1.find((r) => r.userId === 'p1')!.points).toBe(1.5);
  });

  it('bruker nickname over name i displayName, med Ukjent spiller-fallback', () => {
    const result = computeCupPlayerPoints({
      matches: [],
      roster: {
        team1: [
          { userId: 'p1', name: 'Per Hansen', nickname: 'Pelle' },
          { userId: 'p2', name: null, nickname: null },
        ],
        team2: [],
      },
      sideAwards: [],
    });

    const names = result.team1.map((r) => r.displayName);
    expect(names).toContain('Pelle');
    expect(names).toContain('Ukjent spiller');
  });
});
