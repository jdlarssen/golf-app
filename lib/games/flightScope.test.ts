import { describe, it, expect } from 'vitest';
import {
  MAX_FLIGHT_SIZE,
  isSingleFlightGame,
  needsFlightAssignment,
  unassignedActivePlayers,
  suggestFlightSplit,
  flightBuckets,
  peersForApproval,
  canApproveScorecardFor,
  pendingApprovalsFor,
  eligibleForFlightAssignment,
  type FlightPlayer,
} from './flightScope';
import type { GameMode } from '@/lib/scoring/modes/types';

// Helper: active player with flight
function p(
  user_id: string,
  flight_number: number | null = null,
  withdrawn_at: string | null = null,
): FlightPlayer {
  return { user_id, flight_number, withdrawn_at };
}

// Helper: withdrawn player
function withdrawn(user_id: string, flight_number: number | null = null): FlightPlayer {
  return p(user_id, flight_number, '2026-01-01T00:00:00Z');
}

// ─── MAX_FLIGHT_SIZE ─────────────────────────────────────────────────────────

describe('MAX_FLIGHT_SIZE', () => {
  it('er 4', () => {
    expect(MAX_FLIGHT_SIZE).toBe(4);
  });
});

// ─── isSingleFlightGame ───────────────────────────────────────────────────────

describe('isSingleFlightGame', () => {
  const stableford: GameMode = 'stableford';
  const wolf: GameMode = 'wolf';
  const skins: GameMode = 'skins';
  const singles: GameMode = 'singles_matchplay';

  it.each<[string, GameMode, FlightPlayer[], boolean]>([
    [
      '1 aktiv spiller → single flight',
      stableford,
      [p('u1')],
      true,
    ],
    [
      '4 aktive spillere → single flight (grense)',
      stableford,
      [p('u1'), p('u2'), p('u3'), p('u4')],
      true,
    ],
    [
      '5 aktive spillere → ikke single flight',
      skins,
      [p('u1'), p('u2'), p('u3'), p('u4'), p('u5')],
      false,
    ],
    [
      '6 aktive spillere → ikke single flight',
      stableford,
      [p('u1'), p('u2'), p('u3'), p('u4'), p('u5'), p('u6')],
      false,
    ],
    [
      'wolf med 5 spillere → single flight (wolf-unntak)',
      wolf,
      [p('u1'), p('u2'), p('u3'), p('u4'), p('u5')],
      true,
    ],
    [
      'wolf med 3 spillere → single flight',
      wolf,
      [p('u1'), p('u2'), p('u3')],
      true,
    ],
    [
      'trukkede teller ikke: 5 totalt, 1 trukket → 4 aktive → single flight',
      stableford,
      [p('u1'), p('u2'), p('u3'), p('u4'), withdrawn('u5')],
      true,
    ],
    [
      'trukkede teller ikke: 6 totalt, 1 trukket → 5 aktive → ikke single flight',
      skins,
      [p('u1'), p('u2'), p('u3'), p('u4'), p('u5'), withdrawn('u6')],
      false,
    ],
    [
      'singles matchplay, 2 spillere → single flight',
      singles,
      [p('u1', 1), p('u2', 2)],
      true,
    ],
    [
      'tom roster → single flight (0 ≤ 4)',
      stableford,
      [],
      true,
    ],
  ])('%s', (_, mode, players, expected) => {
    expect(isSingleFlightGame(mode, players)).toBe(expected);
  });
});

// ─── needsFlightAssignment ────────────────────────────────────────────────────

describe('needsFlightAssignment', () => {
  const skins: GameMode = 'skins';
  const stableford: GameMode = 'stableford';
  const wolf: GameMode = 'wolf';

  it.each<[string, GameMode, FlightPlayer[], boolean]>([
    [
      '≤4 aktive (single-flight) → false',
      stableford,
      [p('u1'), p('u2'), p('u3')],
      false,
    ],
    [
      'wolf med 5 → false (wolf = alltid single-flight)',
      wolf,
      [p('u1'), p('u2'), p('u3'), p('u4'), p('u5')],
      false,
    ],
    [
      '>4 aktive, alle har flight → false',
      skins,
      [p('u1', 1), p('u2', 1), p('u3', 1), p('u4', 1), p('u5', 2), p('u6', 2)],
      false,
    ],
    [
      '>4 aktive, noen uten flight → true',
      skins,
      [p('u1', 1), p('u2', 1), p('u3', null), p('u4', null), p('u5', null)],
      true,
    ],
    [
      '>4 aktive, alle uten flight → true',
      skins,
      [p('u1'), p('u2'), p('u3'), p('u4'), p('u5')],
      true,
    ],
    [
      'trukkede ignoreres: 6 spillere, 1 trukket → 5 aktive uten flight → true',
      skins,
      [p('u1'), p('u2'), p('u3'), p('u4'), p('u5'), withdrawn('u6')],
      true,
    ],
    [
      'trukkede ignoreres: 6 spillere, 2 trukkede → 4 aktive → false',
      stableford,
      [p('u1'), p('u2'), p('u3'), p('u4'), withdrawn('u5'), withdrawn('u6')],
      false,
    ],
  ])('%s', (_, mode, players, expected) => {
    expect(needsFlightAssignment(mode, players)).toBe(expected);
  });
});

// ─── unassignedActivePlayers ─────────────────────────────────────────────────

describe('unassignedActivePlayers', () => {
  it('returnerer bare aktive spillere uten flight', () => {
    const players: FlightPlayer[] = [
      p('u1', 1),
      p('u2', null),
      p('u3', 2),
      p('u4', null),
      withdrawn('u5', null),
    ];
    const result = unassignedActivePlayers(players);
    expect(result.map((r) => r.user_id)).toEqual(['u2', 'u4']);
  });

  it('tom liste når alle har flight', () => {
    const players = [p('u1', 1), p('u2', 1)];
    expect(unassignedActivePlayers(players)).toEqual([]);
  });

  it('ignorerer trukkede selv med null flight', () => {
    const players = [withdrawn('u1', null), withdrawn('u2', null)];
    expect(unassignedActivePlayers(players)).toEqual([]);
  });
});

// ─── suggestFlightSplit ───────────────────────────────────────────────────────

describe('suggestFlightSplit', () => {
  it('4 spillere → alle flight 1', () => {
    const players = [p('u1'), p('u2'), p('u3'), p('u4')];
    const result = suggestFlightSplit(players);
    expect(result).toHaveLength(4);
    for (const r of result) {
      expect(r.flight_number).toBe(1);
    }
  });

  it('8 spillere → flight 1 (fire) + flight 2 (fire)', () => {
    const players = Array.from({ length: 8 }, (_, i) => p(`u${i + 1}`));
    const result = suggestFlightSplit(players);
    const byFlight = new Map<number, number>();
    for (const r of result) {
      byFlight.set(r.flight_number, (byFlight.get(r.flight_number) ?? 0) + 1);
    }
    expect(byFlight.get(1)).toBe(4);
    expect(byFlight.get(2)).toBe(4);
  });

  it('5 spillere → flight 1 (fire) + flight 2 (én)', () => {
    const players = Array.from({ length: 5 }, (_, i) => p(`u${i + 1}`));
    const result = suggestFlightSplit(players);
    const byFlight = new Map<number, number>();
    for (const r of result) {
      byFlight.set(r.flight_number, (byFlight.get(r.flight_number) ?? 0) + 1);
    }
    expect(byFlight.get(1)).toBe(4);
    expect(byFlight.get(2)).toBe(1);
  });

  it('9 spillere → tre flighter (4+4+1)', () => {
    const players = Array.from({ length: 9 }, (_, i) => p(`u${i + 1}`));
    const result = suggestFlightSplit(players);
    const byFlight = new Map<number, number>();
    for (const r of result) {
      byFlight.set(r.flight_number, (byFlight.get(r.flight_number) ?? 0) + 1);
    }
    expect(byFlight.size).toBe(3);
    expect(byFlight.get(1)).toBe(4);
    expect(byFlight.get(2)).toBe(4);
    expect(byFlight.get(3)).toBe(1);
  });

  it('returnerer user_id og flight_number per spiller', () => {
    const players = [p('alice'), p('bob')];
    const result = suggestFlightSplit(players);
    expect(result).toEqual([
      { user_id: 'alice', flight_number: 1 },
      { user_id: 'bob', flight_number: 1 },
    ]);
  });

  it('trukkede spillere hoppes over', () => {
    const players = [p('u1'), withdrawn('u2'), p('u3'), p('u4'), p('u5')];
    const result = suggestFlightSplit(players);
    const ids = result.map((r) => r.user_id);
    expect(ids).not.toContain('u2');
    // 4 aktive → flight 1
    expect(result.every((r) => r.flight_number === 1)).toBe(true);
  });

  it('respekterer rekkefølgen i arrayet (signups-rekkefølge)', () => {
    const players = Array.from({ length: 5 }, (_, i) => p(`u${i + 1}`));
    const result = suggestFlightSplit(players);
    // u1..u4 → flight 1, u5 → flight 2
    expect(result.find((r) => r.user_id === 'u1')?.flight_number).toBe(1);
    expect(result.find((r) => r.user_id === 'u4')?.flight_number).toBe(1);
    expect(result.find((r) => r.user_id === 'u5')?.flight_number).toBe(2);
  });
});

// ─── peersForApproval ────────────────────────────────────────────────────────

describe('peersForApproval', () => {
  const singles: GameMode = 'singles_matchplay';
  const stableford: GameMode = 'stableford';
  const skins: GameMode = 'skins';
  const wolf: GameMode = 'wolf';

  it('singles matchplay, 2 spillere: motstander er peer', () => {
    // Én-flight-regel: 2 aktive → singleFlight.
    const players = [p('alice', 1), p('bob', 2)];
    expect(peersForApproval(players, singles, 'alice')).toEqual(['bob']);
    expect(peersForApproval(players, singles, 'bob')).toEqual(['alice']);
  });

  it('foursomes, 4 spillere: alle tre andre er peers (kryss-lag)', () => {
    const foursomes: GameMode = 'foursomes_matchplay';
    const players = [p('a', 1), p('b', 1), p('c', 2), p('d', 2)];
    const peers = peersForApproval(players, foursomes, 'a');
    expect(peers.sort()).toEqual(['b', 'c', 'd']);
  });

  it('wolf med 5 spillere: alle fire andre er peers', () => {
    const players = Array.from({ length: 5 }, (_, i) => p(`u${i + 1}`, null));
    const peers = peersForApproval(players, wolf, 'u1');
    expect(peers.sort()).toEqual(['u2', 'u3', 'u4', 'u5']);
  });

  it('>4 spillere med tildelte flighter: kun samme flight', () => {
    // 6 spillere: flight 1 = a,b,c,d; flight 2 = e,f
    const players = [
      p('a', 1), p('b', 1), p('c', 1), p('d', 1),
      p('e', 2), p('f', 2),
    ];
    const peers = peersForApproval(players, skins, 'a');
    expect(peers.sort()).toEqual(['b', 'c', 'd']);
    // flight 2
    expect(peersForApproval(players, skins, 'e').sort()).toEqual(['f']);
  });

  it('>4 spillere uten flight: ingen peers', () => {
    const players = Array.from({ length: 5 }, (_, i) => p(`u${i + 1}`, null));
    expect(peersForApproval(players, stableford, 'u1')).toEqual([]);
  });

  it('trukkede spillere ekskluderes alltid', () => {
    // 4 aktive + 1 trukket → singleFlight, men trukket teller ikke som peer.
    const players = [p('a', 1), p('b', 2), p('c', null), p('d', null), withdrawn('wd')];
    const peers = peersForApproval(players, singles, 'a');
    expect(peers).not.toContain('wd');
    expect(peers.sort()).toEqual(['b', 'c', 'd']);
  });

  it('userId selv ekskluderes alltid', () => {
    const players = [p('me', 1), p('other', 2)];
    const peers = peersForApproval(players, singles, 'me');
    expect(peers).not.toContain('me');
  });
});

// ─── canApproveScorecardFor ──────────────────────────────────────────────────

describe('canApproveScorecardFor', () => {
  const singles: GameMode = 'singles_matchplay';
  const foursomes: GameMode = 'foursomes_matchplay';
  const stableford: GameMode = 'stableford';
  const skins: GameMode = 'skins';
  const wolf: GameMode = 'wolf';

  // 6 spillere med tildelte flighter: 1 = a,b,c,d — 2 = e,f
  const splitSix: FlightPlayer[] = [
    p('a', 1), p('b', 1), p('c', 1), p('d', 1),
    p('e', 2), p('f', 2),
  ];

  it.each<[string, GameMode, FlightPlayer[], string, string, boolean]>([
    [
      'singles matchplay: motstander på side 2 kan attestere side 1 (#543)',
      singles,
      [p('alice', 1), p('bob', 2)],
      'bob',
      'alice',
      true,
    ],
    [
      'singles matchplay: og motsatt vei',
      singles,
      [p('alice', 1), p('bob', 2)],
      'alice',
      'bob',
      true,
    ],
    [
      'foursomes: kryss-lag attestering (4 aktive → én flight)',
      foursomes,
      [p('a', 1), p('b', 1), p('c', 2), p('d', 2)],
      'a',
      'c',
      true,
    ],
    [
      'wolf med 5 flight-løse: alle attesterer alle',
      wolf,
      Array.from({ length: 5 }, (_, i) => p(`u${i + 1}`, null)),
      'u1',
      'u5',
      true,
    ],
    ['>4 med flighter: samme flight → true', skins, splitSix, 'a', 'b', true],
    ['>4 med flighter: kryss-flight → false', skins, splitSix, 'a', 'e', false],
    [
      '>4 uten flight: ingen kan attestere',
      stableford,
      Array.from({ length: 6 }, (_, i) => p(`u${i + 1}`, null)),
      'u1',
      'u2',
      false,
    ],
    [
      'selv-godkjenning → false',
      singles,
      [p('alice', 1), p('bob', 2)],
      'alice',
      'alice',
      false,
    ],
    [
      'trukket attestant → false',
      singles,
      [p('alice', 1), withdrawn('bob', 2)],
      'bob',
      'alice',
      false,
    ],
    [
      'trukket eier → false',
      singles,
      [withdrawn('alice', 1), p('bob', 2)],
      'bob',
      'alice',
      false,
    ],
    [
      'ukjent attestant → false',
      singles,
      [p('alice', 1), p('bob', 2)],
      'ghost',
      'alice',
      false,
    ],
    [
      'ukjent eier → false',
      singles,
      [p('alice', 1), p('bob', 2)],
      'alice',
      'ghost',
      false,
    ],
  ])('%s', (_, mode, players, approver, owner, expected) => {
    expect(canApproveScorecardFor(players, mode, approver, owner)).toBe(
      expected,
    );
  });

  it('er enig med peersForApproval for alle oppsett (regelen har ett hjem)', () => {
    const setups: [GameMode, FlightPlayer[]][] = [
      [singles, [p('alice', 1), p('bob', 2)]],
      [foursomes, [p('a', 1), p('b', 1), p('c', 2), p('d', 2)]],
      [wolf, Array.from({ length: 5 }, (_, i) => p(`u${i + 1}`, null))],
      [skins, splitSix],
      [stableford, Array.from({ length: 6 }, (_, i) => p(`u${i + 1}`, null))],
      [singles, [p('a', 1), p('b', 2), p('c', null), withdrawn('wd')]],
    ];
    for (const [mode, players] of setups) {
      for (const approver of players) {
        for (const owner of players) {
          expect(
            peersForApproval(players, mode, owner.user_id).includes(
              approver.user_id,
            ),
          ).toBe(
            canApproveScorecardFor(
              players,
              mode,
              approver.user_id,
              owner.user_id,
            ),
          );
        }
      }
    }
  });
});

// ─── pendingApprovalsFor ─────────────────────────────────────────────────────

describe('pendingApprovalsFor', () => {
  const singles: GameMode = 'singles_matchplay';
  const skins: GameMode = 'skins';

  // Helper: spiller-rad med innleverings-status
  function card(
    user_id: string,
    flight_number: number | null,
    submitted_at: string | null,
    approved_at: string | null = null,
    withdrawn_at: string | null = null,
  ) {
    return { user_id, flight_number, withdrawn_at, submitted_at, approved_at };
  }

  const SUBMITTED = '2026-07-28T10:00:00Z';

  it('singles matchplay: motstanderens leverte kort venter på meg', () => {
    const players = [
      card('alice', 1, SUBMITTED),
      card('bob', 2, null),
    ];
    expect(
      pendingApprovalsFor(players, singles, 'bob').map((x) => x.user_id),
    ).toEqual(['alice']);
  });

  it('ekskluderer eget kort, ikke-levert og allerede godkjent', () => {
    const players = [
      card('me', 1, SUBMITTED), // eget kort
      card('submitted', 1, SUBMITTED), // venter → med
      card('notSubmitted', 2, null),
      card('alreadyApproved', 2, SUBMITTED, '2026-07-28T11:00:00Z'),
    ];
    expect(
      pendingApprovalsFor(players, singles, 'me').map((x) => x.user_id),
    ).toEqual(['submitted']);
  });

  it('>4 med flighter: kun egen flight teller', () => {
    const players = [
      card('a', 1, null),
      card('b', 1, SUBMITTED),
      card('c', 1, null),
      card('d', 1, null),
      card('e', 2, SUBMITTED),
      card('f', 2, SUBMITTED),
    ];
    expect(pendingApprovalsFor(players, skins, 'a').map((x) => x.user_id)).toEqual(
      ['b'],
    );
  });

  it('trukket eier faller ut (can_score_for krever to aktive)', () => {
    const players = [
      card('alice', 1, SUBMITTED, null, '2026-07-28T09:00:00Z'),
      card('bob', 2, null),
    ];
    expect(pendingApprovalsFor(players, singles, 'bob')).toEqual([]);
  });
});

// ─── eligibleForFlightAssignment ─────────────────────────────────────────────

describe('eligibleForFlightAssignment', () => {
  const skins: GameMode = 'skins';
  const stableford: GameMode = 'stableford';
  const wolf: GameMode = 'wolf';
  const singles: GameMode = 'singles_matchplay';

  it.each<[string, GameMode, FlightPlayer[], boolean]>([
    [
      '5 aktive skins-spillere → eligible',
      skins,
      Array.from({ length: 5 }, (_, i) => p(`u${i + 1}`)),
      true,
    ],
    [
      '8 aktive stableford-spillere → eligible',
      stableford,
      Array.from({ length: 8 }, (_, i) => p(`u${i + 1}`)),
      true,
    ],
    [
      '4 aktive spillere → ikke eligible (single-flight)',
      skins,
      [p('u1'), p('u2'), p('u3'), p('u4')],
      false,
    ],
    [
      '3 aktive spillere → ikke eligible (single-flight)',
      stableford,
      [p('u1'), p('u2'), p('u3')],
      false,
    ],
    [
      'wolf med 5 spillere → ikke eligible (wolf = alltid én gruppe)',
      wolf,
      Array.from({ length: 5 }, (_, i) => p(`u${i + 1}`)),
      false,
    ],
    [
      'singles matchplay 2 spillere → ikke eligible (single-flight)',
      singles,
      [p('u1', 1), p('u2', 2)],
      false,
    ],
    [
      'trukkede teller ikke: 6 totalt, 2 trukkede → 4 aktive → ikke eligible',
      skins,
      [p('u1'), p('u2'), p('u3'), p('u4'), withdrawn('u5'), withdrawn('u6')],
      false,
    ],
    [
      'trukkede teller ikke: 6 totalt, 1 trukket → 5 aktive → eligible',
      skins,
      [p('u1'), p('u2'), p('u3'), p('u4'), p('u5'), withdrawn('u6')],
      true,
    ],
  ])('%s', (_, mode, players, expected) => {
    expect(eligibleForFlightAssignment(mode, players)).toBe(expected);
  });
});

// ─── flightBuckets ────────────────────────────────────────────────────────────

describe('flightBuckets', () => {
  it('returnerer tildelte flighter og unassigned-liste', () => {
    const players: FlightPlayer[] = [
      p('u1', 1),
      p('u2', 1),
      p('u3', 2),
      p('u4', null),
    ];
    const result = flightBuckets(players);
    expect(result.assigned.get(1)?.map((r) => r.user_id)).toEqual(['u1', 'u2']);
    expect(result.assigned.get(2)?.map((r) => r.user_id)).toEqual(['u3']);
    expect(result.unassigned.map((r) => r.user_id)).toEqual(['u4']);
  });

  it('trukkede ekskluderes fra alle buckets', () => {
    const players: FlightPlayer[] = [
      p('u1', 1),
      withdrawn('u2', 1),
      p('u3', null),
      withdrawn('u4', null),
    ];
    const result = flightBuckets(players);
    expect(result.assigned.get(1)?.map((r) => r.user_id)).toEqual(['u1']);
    expect(result.unassigned.map((r) => r.user_id)).toEqual(['u3']);
  });

  it('tom roster → tomt resultat', () => {
    const result = flightBuckets([]);
    expect(result.assigned.size).toBe(0);
    expect(result.unassigned).toEqual([]);
  });

  it('alle uassignert → tom assigned-map + alle i unassigned', () => {
    const players = [p('u1'), p('u2'), p('u3')];
    const result = flightBuckets(players);
    expect(result.assigned.size).toBe(0);
    expect(result.unassigned).toHaveLength(3);
  });
});
