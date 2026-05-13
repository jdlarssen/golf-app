import { describe, it, expect } from 'vitest';
import { findPendingPlayers, type RosterPlayer } from './pendingPlayers';

describe('findPendingPlayers', () => {
  it('returns empty array when all players have completed profile', () => {
    const players: RosterPlayer[] = [
      { id: 'a', email: 'a@x.no', profile_completed_at: '2026-05-12T10:00:00Z' },
      { id: 'b', email: 'b@x.no', profile_completed_at: '2026-05-12T10:00:00Z' },
    ];
    expect(findPendingPlayers(players)).toEqual([]);
  });

  it('returns players whose profile_completed_at is null', () => {
    const players: RosterPlayer[] = [
      { id: 'a', email: 'a@x.no', profile_completed_at: null },
      { id: 'b', email: 'b@x.no', profile_completed_at: '2026-05-12T10:00:00Z' },
      { id: 'c', email: 'c@x.no', profile_completed_at: null },
    ];
    expect(findPendingPlayers(players)).toEqual([
      { id: 'a', email: 'a@x.no' },
      { id: 'c', email: 'c@x.no' },
    ]);
  });

  it('returns empty for empty roster', () => {
    expect(findPendingPlayers([])).toEqual([]);
  });
});
