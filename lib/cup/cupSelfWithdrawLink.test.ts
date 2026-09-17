import { describe, it, expect } from 'vitest';
import type { CupMatchInput } from './computeCupLeaderboard';
import type { CupMatchWithdrawal } from './cupWithdrawalOutcome';
import type { CupRoster } from './cupRoster';
import { canSelfWithdrawFromCup } from './cupSelfWithdrawLink';

/**
 * #1814, #2033, #2052 — when the cup page shows «Trekk meg fra cupen» (Type A).
 * Fourball a1+a2 against b1+b2; the roster flags a player `withdrawn` exactly
 * when `buildCupRoster` would.
 */

const HALVED: CupMatchWithdrawal = {
  outcome: 'halved',
  winnerSide: 'tied',
  withdrawnSide: 1,
  withdrawnUserIds: ['a1'],
  late: false,
};

function match(overrides: Partial<CupMatchInput> = {}): CupMatchInput {
  return {
    gameId: 'g1',
    matchLabel: null,
    team1PlayerName: 'A',
    team2PlayerName: 'B',
    gameMode: 'fourball_matchplay',
    status: 'scheduled',
    result: null,
    team1UserIds: ['a1', 'a2'],
    team2UserIds: ['b1', 'b2'],
    withdrawal: null,
    soloPlayOn: null,
    playOnChoicePending: false,
    ...overrides,
  };
}

function roster(withdrawn: string[] = []): CupRoster {
  const player = (userId: string) => ({
    userId,
    name: userId,
    nickname: null,
    withdrawn: withdrawn.includes(userId),
  });
  return { team1: ['a1', 'a2'].map(player), team2: ['b1', 'b2'].map(player) };
}

describe('canSelfWithdrawFromCup', () => {
  it.each<[string, Parameters<typeof canSelfWithdrawFromCup>[0], boolean]>([
    ['ikke innlogget', { userId: null, cupStatus: 'active', matches: [match()], roster: roster() }, false],
    ['cupen er ikke i gang', { userId: 'a1', cupStatus: 'draft', matches: [match()], roster: roster() }, false],
    [
      'ingen kamper igjen som ikke har startet',
      { userId: 'a1', cupStatus: 'active', matches: [match({ status: 'active' })], roster: roster() },
      false,
    ],
    ['vanlig deltaker med planlagt kamp', { userId: 'a1', cupStatus: 'active', matches: [match()], roster: roster() }, true],
    [
      'makkeren i en fourball der valget venter (#2033)',
      {
        userId: 'a2',
        cupStatus: 'active',
        matches: [match({ withdrawal: HALVED, playOnChoicePending: true })],
        roster: roster(['a1']),
      },
      true,
    ],
    [
      'den som trakk seg, valget venter (#2033)',
      {
        userId: 'a1',
        cupStatus: 'active',
        matches: [match({ withdrawal: HALVED, playOnChoicePending: true })],
        roster: roster(['a1']),
      },
      false,
    ],
    [
      'den som trakk seg, makkeren spiller alene (#2052)',
      {
        userId: 'a1',
        cupStatus: 'active',
        matches: [match({ withdrawal: null, soloPlayOn: { partnerName: 'a2' } })],
        roster: roster(['a1']),
      },
      false,
    ],
    [
      'makkeren som spiller alene',
      {
        userId: 'a2',
        cupStatus: 'active',
        matches: [match({ withdrawal: null, soloPlayOn: { partnerName: 'a2' } })],
        roster: roster(['a1']),
      },
      true,
    ],
    [
      'motstander i en kamp avgjort ved trekk (halvert)',
      { userId: 'b1', cupStatus: 'active', matches: [match({ withdrawal: HALVED })], roster: roster(['a1']) },
      false,
    ],
  ])('%s', (_name, args, expected) => {
    expect(canSelfWithdrawFromCup(args)).toBe(expected);
  });
});
