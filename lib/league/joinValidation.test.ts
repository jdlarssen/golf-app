import { describe, it, expect } from 'vitest';
import {
  closedRoundSequences,
  evaluateLeagueJoin,
  lateJoinNotice,
  type LeagueJoinFacts,
} from './joinValidation';

/**
 * Type A for the decision behind the shareable league link (#2662). The page
 * and the action both call `evaluateLeagueJoin`, so the order of the guards is
 * the contract.
 */

const OPEN: LeagueJoinFacts = {
  leagueExists: true,
  status: 'draft',
  signedIn: true,
  profileCompleted: true,
  alreadyJoined: false,
};

describe('evaluateLeagueJoin', () => {
  it.each<[string, Partial<LeagueJoinFacts>, string]>([
    ['a draft league', {}, 'can_join'],
    ['an active league (late join)', { status: 'active' }, 'can_join'],
    ['an unknown or switched-off link', { leagueExists: false }, 'not_found'],
    ['a finished league', { status: 'finished' }, 'closed'],
    ['already in the league', { alreadyJoined: true }, 'already_joined'],
    ['no handicap on the profile', { profileCompleted: false }, 'profile_incomplete'],
    // Order: a missing league wins over everything, a finished one over being in it.
    ['unknown link, even if the rest says closed', { leagueExists: false, status: 'finished' }, 'not_found'],
    ['finished, even for a participant', { status: 'finished', alreadyJoined: true }, 'closed'],
    // Already in: the way on is the league, not the profile form.
    ['already in, profile not done', { alreadyJoined: true, profileCompleted: false }, 'already_joined'],
    // Logged out: the league is shown, the way on is the login (#2662 criterion 2).
    ['logged out', { signedIn: false, profileCompleted: false }, 'sign_in'],
    ['logged out, unknown link', { signedIn: false, leagueExists: false }, 'not_found'],
    ['logged out, finished league', { signedIn: false, status: 'finished' }, 'closed'],
  ])('%s → %s', (_label, patch, expected) => {
    expect(evaluateLeagueJoin({ ...OPEN, ...patch })).toBe(expected);
  });
});

describe('closedRoundSequences', () => {
  const now = Date.parse('2026-11-20T12:00:00Z');
  const round = (sequence: number, opensAt: string, closesAt: string) => ({
    sequence,
    opensAt,
    closesAt,
  });

  it('no rounds → none', () => {
    expect(closedRoundSequences([], now)).toEqual([]);
  });

  it('only rounds whose window has closed (owner 27.10: an open round can still be played)', () => {
    const rounds = [
      round(1, '2026-11-09T00:00:00Z', '2026-11-15T22:59:00Z'), // closed
      round(2, '2026-11-16T00:00:00Z', '2026-11-22T22:59:00Z'), // open now
      round(3, '2026-11-23T00:00:00Z', '2026-11-29T22:59:00Z'), // upcoming
    ];
    expect(closedRoundSequences(rounds, now)).toEqual([1]);
  });

  it('several closed rounds, sorted by sequence', () => {
    const rounds = [
      round(2, '2026-10-01T00:00:00Z', '2026-10-07T22:59:00Z'),
      round(1, '2026-09-01T00:00:00Z', '2026-09-07T22:59:00Z'),
      round(3, '2026-11-16T00:00:00Z', '2026-11-22T22:59:00Z'),
    ];
    expect(closedRoundSequences(rounds, now)).toEqual([1, 2]);
  });

  it('a window that closes at this very instant is still open (same rule as the league page)', () => {
    const rounds = [round(1, '2026-11-09T00:00:00Z', '2026-11-20T12:00:00Z')];
    expect(closedRoundSequences(rounds, now)).toEqual([]);
  });

  it('a round the organiser kept open past its first date counts as open', () => {
    // overrideRoundWindow moves closes_at; only closes_at decides.
    const rounds = [round(1, '2026-11-09T00:00:00Z', '2026-11-25T22:59:00Z')];
    expect(closedRoundSequences(rounds, now)).toEqual([]);
  });
});

describe('lateJoinNotice', () => {
  const now = Date.parse('2026-11-20T12:00:00Z');
  const closed = (sequence: number) => ({ sequence, closesAt: '2026-11-15T22:59:00Z' });
  const open = (sequence: number) => ({ sequence, closesAt: '2026-11-22T22:59:00Z' });

  it('nothing closed (a draft league, or round 1 still open) → no line', () => {
    expect(lateJoinNotice([open(1), open(2)], now)).toEqual({ kind: 'none' });
  });

  it('no rounds yet → no line', () => {
    expect(lateJoinNotice([], now)).toEqual({ kind: 'none' });
  });

  it('some closed → «Runde … er spilt. Du er med fra neste runde.»', () => {
    expect(lateJoinNotice([closed(1), open(2)], now)).toEqual({ kind: 'from_next_round', played: [1] });
  });

  it('every round closed → no «neste runde» to promise', () => {
    expect(lateJoinNotice([closed(1), closed(2)], now)).toEqual({ kind: 'all_played', played: [1, 2] });
  });
});
