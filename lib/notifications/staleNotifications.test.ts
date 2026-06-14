import { describe, it, expect } from 'vitest';
import {
  collectSignupGameIds,
  filterStaleSignupNotifications,
} from './staleNotifications';
import type { NotificationKind, NotificationPayload } from './types';

function n<K extends NotificationKind>(
  id: string,
  kind: K,
  payload: NotificationPayload<K>,
) {
  return { id, kind, payload };
}

const GAME_A = '11111111-1111-1111-1111-111111111111';
const GAME_B = '22222222-2222-2222-2222-222222222222';
const GAME_C = '33333333-3333-3333-3333-333333333333';

const signup = (id: string, gameId: string) =>
  n(id, 'registration_request', {
    game_id: gameId,
    game_name: 'X',
    requester_name: 'Per',
  });

const invite = (id: string, gameId: string) =>
  n(id, 'invite', { game_id: gameId, game_name: 'X', invited_by_name: 'Per' });

describe('collectSignupGameIds', () => {
  it('returns the distinct game ids from registration_request rows only', () => {
    const rows = [
      signup('a', GAME_A),
      invite('b', GAME_B), // not a signup → ignored
      signup('c', GAME_A), // duplicate game → deduped
      signup('d', GAME_C),
    ];
    const ids = collectSignupGameIds(rows);
    expect(ids.sort()).toEqual([GAME_A, GAME_C].sort());
  });

  it('returns an empty array when there are no signup notifications', () => {
    expect(collectSignupGameIds([invite('b', GAME_B)])).toEqual([]);
  });
});

describe('filterStaleSignupNotifications', () => {
  it('drops registration_request rows whose game no longer exists', () => {
    const rows = [
      signup('a', GAME_A), // exists → kept
      signup('b', GAME_B), // missing → dropped
    ];
    const kept = filterStaleSignupNotifications(rows, new Set([GAME_A]));
    expect(kept.map((r) => r.id)).toEqual(['a']);
  });

  it('keeps every non-signup notification regardless of game existence', () => {
    // An invite for a deleted game stays — the branded not-found is the
    // safety net for those rare dead-ends (#612). Only signups are pruned.
    const rows = [invite('b', GAME_B)];
    const kept = filterStaleSignupNotifications(rows, new Set<string>());
    expect(kept.map((r) => r.id)).toEqual(['b']);
  });

  it('preserves order and keeps a mix of fresh signups and other kinds', () => {
    const rows = [
      invite('keep-1', GAME_B),
      signup('stale', GAME_C),
      signup('fresh', GAME_A),
    ];
    const kept = filterStaleSignupNotifications(rows, new Set([GAME_A, GAME_B]));
    expect(kept.map((r) => r.id)).toEqual(['keep-1', 'fresh']);
  });
});
