import { describe, it, expect } from 'vitest';
import {
  isSideAwardRegistered,
  allSideAwardsRegistered,
  unregisteredSideAwards,
  type SideAwardRegistrationState,
} from './sideAwardsRegistered';

describe('isSideAwardRegistered', () => {
  it.each<[string, SideAwardRegistrationState, boolean]>([
    ['ctp with winner', { kind: 'ctp', winnerUserId: 'u1' }, true],
    ['ctp without winner', { kind: 'ctp', winnerUserId: null }, false],
    ['ld with winner', { kind: 'ld', winnerUserId: 'u2' }, true],
    ['ld without winner', { kind: 'ld', winnerUserId: null }, false],
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
        { kind: 'ctp', winnerUserId: 'u1' },
        { kind: 'gir', team1Count: 0, team2Count: 1 },
      ]),
    ).toBe(true);
  });

  it('is false when any award is unregistered', () => {
    expect(
      allSideAwardsRegistered([
        { kind: 'ctp', winnerUserId: 'u1' },
        { kind: 'ld', winnerUserId: null },
      ]),
    ).toBe(false);
  });
});

describe('unregisteredSideAwards', () => {
  it('returns only the unregistered rows, preserving their objects', () => {
    const awards: SideAwardRegistrationState[] = [
      { kind: 'ctp', winnerUserId: 'u1' },
      { kind: 'ld', winnerUserId: null },
      { kind: 'gir', team1Count: null, team2Count: 2 },
      { kind: 'gir', team1Count: 0, team2Count: 0 },
    ];
    expect(unregisteredSideAwards(awards)).toEqual([
      { kind: 'ld', winnerUserId: null },
      { kind: 'gir', team1Count: null, team2Count: 2 },
    ]);
  });

  it('is empty when all are registered', () => {
    expect(
      unregisteredSideAwards([{ kind: 'ctp', winnerUserId: 'u1' }]),
    ).toEqual([]);
  });
});
