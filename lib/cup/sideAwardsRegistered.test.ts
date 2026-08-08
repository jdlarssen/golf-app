import { describe, it, expect } from 'vitest';
import {
  isSideAwardRegistered,
  allSideAwardsRegistered,
  unregisteredSideAwards,
  type SideAwardRegistrationState,
} from './sideAwardsRegistered';

describe('isSideAwardRegistered', () => {
  it.each<[string, SideAwardRegistrationState, boolean]>([
    ['ctp with winner', { kind: 'ctp', winnerUserId: 'u1', noWinner: false }, true],
    ['ctp without winner', { kind: 'ctp', winnerUserId: null, noWinner: false }, false],
    ['ld with winner', { kind: 'ld', winnerUserId: 'u2', noWinner: false }, true],
    ['ld without winner', { kind: 'ld', winnerUserId: null, noWinner: false }, false],
    // «Ingen vant» (#1530) is a finished answer, not a missing one — it is the
    // whole point of the flag: no winner, but nothing left to register.
    ['ctp answered "no winner"', { kind: 'ctp', winnerUserId: null, noWinner: true }, true],
    ['ld answered "no winner"', { kind: 'ld', winnerUserId: null, noWinner: true }, true],
    ['gir both counts set', { kind: 'gir', team1Count: 1, team2Count: 2 }, true],
    // 0 is a valid registration («registrert null GIR»), not «uregistrert».
    ['gir both counts zero', { kind: 'gir', team1Count: 0, team2Count: 0 }, true],
    ['gir one count zero one set', { kind: 'gir', team1Count: 0, team2Count: 3 }, true],
    ['gir team1 null', { kind: 'gir', team1Count: null, team2Count: 2 }, false],
    ['gir team2 null', { kind: 'gir', team1Count: 2, team2Count: null }, false],
    ['gir both null', { kind: 'gir', team1Count: null, team2Count: null }, false],
  ])('%s → %s', (_label, award, expected) => {
    expect(isSideAwardRegistered(award)).toBe(expected);
  });
});

describe('allSideAwardsRegistered', () => {
  it('is trivially true for a cup with no side awards', () => {
    expect(allSideAwardsRegistered([])).toBe(true);
  });

  it('is true when every award is registered', () => {
    expect(
      allSideAwardsRegistered([
        { kind: 'ctp', winnerUserId: 'u1', noWinner: false },
        { kind: 'gir', team1Count: 0, team2Count: 1 },
      ]),
    ).toBe(true);
  });

  it('is false when any award is unregistered', () => {
    expect(
      allSideAwardsRegistered([
        { kind: 'ctp', winnerUserId: 'u1', noWinner: false },
        { kind: 'ld', winnerUserId: null, noWinner: false },
      ]),
    ).toBe(false);
  });

  // The gate this drives is «Avslutt cupen». A hole nobody won must not lock
  // the cup shut — that was the whole bug in #1530.
  it('lets a cup finish when the only open award was answered "no winner"', () => {
    expect(
      allSideAwardsRegistered([
        { kind: 'ctp', winnerUserId: 'u1', noWinner: false },
        { kind: 'ld', winnerUserId: null, noWinner: true },
      ]),
    ).toBe(true);
  });
});

describe('unregisteredSideAwards', () => {
  it('returns only the unregistered rows, preserving their objects', () => {
    const awards: SideAwardRegistrationState[] = [
      { kind: 'ctp', winnerUserId: 'u1', noWinner: false },
      { kind: 'ld', winnerUserId: null, noWinner: false },
      { kind: 'gir', team1Count: null, team2Count: 2 },
      { kind: 'gir', team1Count: 0, team2Count: 0 },
    ];
    expect(unregisteredSideAwards(awards)).toEqual([
      { kind: 'ld', winnerUserId: null, noWinner: false },
      { kind: 'gir', team1Count: null, team2Count: 2 },
    ]);
  });

  it('is empty when all are registered', () => {
    expect(
      unregisteredSideAwards([{ kind: 'ctp', winnerUserId: 'u1', noWinner: false }]),
    ).toEqual([]);
  });

  // Drives the «du mangler …»-hint in CupManagement: a hole answered
  // «ingen vant» must not be named as missing.
  it('does not list an award answered "no winner" as missing', () => {
    expect(
      unregisteredSideAwards([
        { kind: 'ctp', winnerUserId: null, noWinner: true },
        { kind: 'ld', winnerUserId: null, noWinner: false },
      ]),
    ).toEqual([{ kind: 'ld', winnerUserId: null, noWinner: false }]);
  });
});
