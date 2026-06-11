import { describe, it, expect } from 'vitest';
import {
  MAX_FLIGHT_SIZE,
  isSingleFlightGame,
  needsFlightAssignment,
  unassignedActivePlayers,
  suggestFlightSplit,
  flightBuckets,
  peersForApproval,
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
