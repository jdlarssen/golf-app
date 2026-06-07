import { describe, it, expect } from 'vitest';
import {
  determineWolfForHole,
  type WolfRotationPlayer,
} from './wolfRotation';

const PLAYERS: WolfRotationPlayer[] = [
  { userId: 'u1', teamNumber: 1 },
  { userId: 'u2', teamNumber: 2 },
  { userId: 'u3', teamNumber: 3 },
  { userId: 'u4', teamNumber: 4 },
];

describe('determineWolfForHole — rotation hull 1-16', () => {
  it.each<[number, string]>([
    [1, 'u1'],
    [2, 'u2'],
    [3, 'u3'],
    [4, 'u4'],
    [5, 'u1'],
    [6, 'u2'],
    [7, 'u3'],
    [8, 'u4'],
    [13, 'u1'],
    [16, 'u4'],
  ])('hull %i → wolf = %s', (hole, expected) => {
    const wolf = determineWolfForHole(hole, PLAYERS, new Map());
    expect(wolf).toBe(expected);
  });
});

describe('determineWolfForHole — trailing-wolf hull 17-18', () => {
  it('hull 17: spilleren med lavest poeng blir Wolf', () => {
    const points = new Map<string, number>([
      ['u1', 10],
      ['u2', 6],
      ['u3', 4], // lowest → wolf
      ['u4', 8],
    ]);
    expect(determineWolfForHole(17, PLAYERS, points)).toBe('u3');
  });

  it('hull 18: lavest poeng', () => {
    const points = new Map<string, number>([
      ['u1', 2], // lowest → wolf
      ['u2', 6],
      ['u3', 4],
      ['u4', 8],
    ]);
    expect(determineWolfForHole(18, PLAYERS, points)).toBe('u1');
  });

  it('hull 17 med tie på lavest poeng: bryter på team_number ASC', () => {
    const points = new Map<string, number>([
      ['u1', 5],
      ['u2', 3], // tied lowest, team_number 2 < team_number 3
      ['u3', 3],
      ['u4', 7],
    ]);
    expect(determineWolfForHole(17, PLAYERS, points)).toBe('u2');
  });

  it('hull 17 med default 0 points for spillere uten innslag', () => {
    // Alle har default 0 → alle tied → bryter på team_number ASC → u1
    expect(determineWolfForHole(17, PLAYERS, new Map())).toBe('u1');
  });
});

describe('determineWolfForHole — explicit override', () => {
  it('explicit wolfFromChoice returneres uavhengig av hull', () => {
    expect(
      determineWolfForHole(1, PLAYERS, new Map(), 'u3'),
    ).toBe('u3');
    expect(
      determineWolfForHole(17, PLAYERS, new Map([['u3', 0]]), 'u4'),
    ).toBe('u4');
  });

  it('explicit som ikke matcher noen spiller faller tilbake til rotasjon', () => {
    expect(
      determineWolfForHole(2, PLAYERS, new Map(), 'unknown-user'),
    ).toBe('u2');
  });
});

describe('determineWolfForHole — edge cases', () => {
  it('tom spillerliste returnerer null', () => {
    expect(determineWolfForHole(1, [], new Map())).toBeNull();
  });

  it('rotasjon med hull på manglende team_number returnerer null', () => {
    // n=2 (avledet fra listelengde), men team_number har et hull: 1 og 3.
    // Hull 2 → slot ((2-1) % 2) + 1 = 2 → ingen spiller har team 2 → null.
    const gapped: WolfRotationPlayer[] = [
      { userId: 'u1', teamNumber: 1 },
      { userId: 'u3', teamNumber: 3 },
    ];
    expect(determineWolfForHole(2, gapped, new Map())).toBeNull();
    // Hull 1 → slot 1 finnes fortsatt.
    expect(determineWolfForHole(1, gapped, new Map())).toBe('u1');
  });
});

// #465 — n=3 og n=5. R = floor(18/n)*n.
const PLAYERS3: WolfRotationPlayer[] = [
  { userId: 'u1', teamNumber: 1 },
  { userId: 'u2', teamNumber: 2 },
  { userId: 'u3', teamNumber: 3 },
];

const PLAYERS5: WolfRotationPlayer[] = [
  { userId: 'u1', teamNumber: 1 },
  { userId: 'u2', teamNumber: 2 },
  { userId: 'u3', teamNumber: 3 },
  { userId: 'u4', teamNumber: 4 },
  { userId: 'u5', teamNumber: 5 },
];

describe('determineWolfForHole — 3 spillere (#465)', () => {
  // n=3 → R=18: hele runden er rotasjon, ingen trailing.
  it.each<[number, string]>([
    [1, 'u1'],
    [2, 'u2'],
    [3, 'u3'],
    [4, 'u1'],
    [16, 'u1'],
    [17, 'u2'],
    [18, 'u3'],
  ])('hull %i → wolf %s (rotasjon hele runden)', (hole, expected) => {
    expect(determineWolfForHole(hole, PLAYERS3, new Map())).toBe(expected);
  });

  it('hull 17/18 følger rotasjon selv med poeng-forskjeller (ingen trailing)', () => {
    const points = new Map<string, number>([
      ['u1', 0],
      ['u2', 10], // ville ikke blitt trailing-wolf — men rotasjon gir u2
      ['u3', 0],
    ]);
    expect(determineWolfForHole(17, PLAYERS3, points)).toBe('u2');
  });
});

describe('determineWolfForHole — 5 spillere (#465)', () => {
  // n=5 → R=15: hull 1-15 rotasjon, hull 16-18 trailing.
  it.each<[number, string]>([
    [1, 'u1'],
    [5, 'u5'],
    [6, 'u1'],
    [15, 'u5'],
  ])('hull %i → wolf %s (rotasjon 1-15)', (hole, expected) => {
    expect(determineWolfForHole(hole, PLAYERS5, new Map())).toBe(expected);
  });

  it('hull 16-18 er trailing (lavest total, tiebreak team ASC)', () => {
    const points = new Map<string, number>([
      ['u1', 5],
      ['u2', 3], // lavest → trailing-wolf
      ['u3', 8],
      ['u4', 6],
      ['u5', 7],
    ]);
    expect(determineWolfForHole(16, PLAYERS5, points)).toBe('u2');
  });
});
