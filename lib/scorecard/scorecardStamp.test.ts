import { describe, it, expect } from 'vitest';
import type { GameMode } from '@/lib/scoring/modes/types';
import { resolveScorecardStamp, type StampPlayer } from './scorecardStamp';

const SIGNED_AT = '2026-09-27T12:32:00Z';
const WITHDRAWN_AT = '2026-09-27T11:00:00Z';

function player(
  user_id: string,
  flight_number: number | null,
  overrides: Partial<StampPlayer> = {},
): StampPlayer {
  return {
    user_id,
    flight_number,
    withdrawn_at: null,
    submitted_at: null,
    submitted_by_user_id: null,
    approved_at: null,
    approved_by_user_id: null,
    name: `${user_id[0].toUpperCase()}${user_id.slice(1)} Nordmann`,
    nickname: null,
    ...overrides,
  };
}

/** Kari's card, delivered; five others so the game is not one flight. */
function roster(kari: Partial<StampPlayer> = {}, extra: StampPlayer[] = []): StampPlayer[] {
  return [
    player('kari', 1, { submitted_at: SIGNED_AT, ...kari }),
    player('anders', 1),
    player('ola', 1),
    player('per', 2),
    player('lise', 2),
    ...extra,
  ];
}

function stamp(
  players: StampPlayer[],
  opts: { gameMode?: GameMode; gameStatus?: string; requirePeerApproval?: boolean } = {},
) {
  return resolveScorecardStamp({
    ownerUserId: 'kari',
    players,
    gameMode: opts.gameMode ?? 'stableford',
    gameStatus: opts.gameStatus ?? 'active',
    requirePeerApproval: opts.requirePeerApproval ?? true,
  });
}

describe('resolveScorecardStamp — when there is a stamp', () => {
  it('gives no stamp before delivery', () => {
    expect(stamp(roster({ submitted_at: null }))).toBeNull();
  });

  it('gives no stamp to a withdrawn player', () => {
    expect(stamp(roster({ withdrawn_at: WITHDRAWN_AT }))).toBeNull();
  });

  it('gives no stamp when the owner is not in the roster', () => {
    expect(stamp(roster().filter((row) => row.user_id !== 'kari'))).toBeNull();
  });

  it('carries the delivery time through', () => {
    expect(stamp(roster())?.signedAt).toBe(SIGNED_AT);
  });

  it.each([
    { status: 'active', locked: false },
    { status: 'scheduled', locked: false },
    { status: 'finished', locked: true },
  ])('locked is $locked when the game is $status', ({ status, locked }) => {
    expect(stamp(roster(), { gameStatus: status })?.locked).toBe(locked);
  });
});

describe('resolveScorecardStamp — who signed', () => {
  it.each([
    { label: 'unknown deliverer', submittedBy: null },
    { label: 'the owner herself', submittedBy: 'kari' },
  ])('self for $label', ({ submittedBy }) => {
    expect(stamp(roster({ submitted_by_user_id: submittedBy }))?.signedBy).toEqual({ kind: 'self' });
  });

  it('names the flight mate who delivered for the owner (#2200)', () => {
    expect(stamp(roster({ submitted_by_user_id: 'ola' }))?.signedBy).toEqual({
      kind: 'other',
      fullName: 'Ola Nordmann',
    });
  });

  it('has no name for a deliverer outside the roster', () => {
    expect(stamp(roster({ submitted_by_user_id: 'ghost' }))?.signedBy).toEqual({
      kind: 'other',
      fullName: null,
    });
  });
});

describe('resolveScorecardStamp — approval line', () => {
  it('marker: a flight mate approved, by first name', () => {
    const players = roster({ approved_at: SIGNED_AT, approved_by_user_id: 'anders' });
    expect(stamp(players)?.approval).toEqual({ kind: 'marker', name: 'Anders' });
  });

  it('marker: uses the nickname when there is one', () => {
    const players = roster({ approved_at: SIGNED_AT, approved_by_user_id: 'anders' });
    players[1] = { ...players[1], nickname: 'Andy' };
    expect(stamp(players)?.approval).toEqual({ kind: 'marker', name: 'Andy' });
  });

  it('marker: anyone in a one-flight game', () => {
    const players = [
      player('kari', null, { submitted_at: SIGNED_AT, approved_at: SIGNED_AT, approved_by_user_id: 'bob' }),
      player('bob', null),
    ];
    expect(stamp(players, { gameMode: 'solo_strokeplay' })?.approval).toEqual({
      kind: 'marker',
      name: 'Bob',
    });
  });

  it('marker: still the marker after withdrawing', () => {
    const players = roster({ approved_at: SIGNED_AT, approved_by_user_id: 'anders' });
    players[1] = { ...players[1], withdrawn_at: WITHDRAWN_AT };
    expect(stamp(players)?.approval).toEqual({ kind: 'marker', name: 'Anders' });
  });

  it('organizer: the approver played in another flight', () => {
    const players = roster({ approved_at: SIGNED_AT, approved_by_user_id: 'per' });
    expect(stamp(players)?.approval).toEqual({ kind: 'organizer' });
  });

  it('organizer: the approver is not a player', () => {
    const players = roster({ approved_at: SIGNED_AT, approved_by_user_id: 'admin' });
    expect(stamp(players)?.approval).toEqual({ kind: 'organizer' });
  });

  it('approved: an older row without the approver id', () => {
    const players = roster({ approved_at: SIGNED_AT, approved_by_user_id: null });
    expect(stamp(players)?.approval).toEqual({ kind: 'approved' });
  });

  it('pending: approval is required and missing', () => {
    expect(stamp(roster(), { requirePeerApproval: true })?.approval).toEqual({ kind: 'pending' });
  });

  it('none: approval is not required and not given', () => {
    expect(stamp(roster(), { requirePeerApproval: false })?.approval).toEqual({ kind: 'none' });
  });

  it('an approval counts even when the game does not require one', () => {
    const players = roster({ approved_at: SIGNED_AT, approved_by_user_id: 'anders' });
    expect(stamp(players, { requirePeerApproval: false })?.approval).toEqual({
      kind: 'marker',
      name: 'Anders',
    });
  });

  it('a finished game waits for nobody: no pending line under a locked result', () => {
    const result = stamp(roster(), { gameStatus: 'finished', requirePeerApproval: true });
    expect(result?.approval).toEqual({ kind: 'none' });
    expect(result?.locked).toBe(true);
  });
});
