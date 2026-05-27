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

  it('hull 1-16 uten matchende team_number returnerer null', () => {
    const incomplete: WolfRotationPlayer[] = [
      { userId: 'u1', teamNumber: 1 },
      { userId: 'u2', teamNumber: 2 },
      // mangler team 3 og 4
    ];
    // hull 3 ber om team 3 — mangler
    expect(determineWolfForHole(3, incomplete, new Map())).toBeNull();
    // hull 1 fungerer fortsatt (team 1 finnes)
    expect(determineWolfForHole(1, incomplete, new Map())).toBe('u1');
  });
});
