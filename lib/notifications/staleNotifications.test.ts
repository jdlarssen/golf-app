import { describe, it, expect } from 'vitest';
import {
  collectSignupGameIds,
  partitionStaleSignupNotifications,
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

describe('partitionStaleSignupNotifications', () => {
  const ids = <T extends { id: string }>(rows: T[]) => rows.map((r) => r.id);

  it('returns two empty buckets for an empty list', () => {
    const { visible, stale } = partitionStaleSignupNotifications(
      [],
      new Set([GAME_A]),
    );
    expect(visible).toEqual([]);
    expect(stale).toEqual([]);
  });

  it('puts registration_request rows whose game no longer exists in stale', () => {
    const rows = [
      signup('a', GAME_A), // exists → visible
      signup('b', GAME_B), // missing → stale
    ];
    const { visible, stale } = partitionStaleSignupNotifications(
      rows,
      new Set([GAME_A]),
    );
    expect(ids(visible)).toEqual(['a']);
    expect(ids(stale)).toEqual(['b']);
  });

  it('moves every signup to stale when no game exists any more', () => {
    const rows = [signup('a', GAME_A), signup('b', GAME_B)];
    const { visible, stale } = partitionStaleSignupNotifications(
      rows,
      new Set<string>(),
    );
    expect(visible).toEqual([]);
    expect(ids(stale)).toEqual(['a', 'b']);
  });

  it('keeps every non-signup notification visible regardless of game existence', () => {
    // An invite for a deleted game stays — the branded not-found is the
    // safety net for those rare dead-ends (#612). Only signups are pruned,
    // and only signups may be archived out from under the user (#1393).
    const rows = [invite('b', GAME_B)];
    const { visible, stale } = partitionStaleSignupNotifications(
      rows,
      new Set<string>(),
    );
    expect(ids(visible)).toEqual(['b']);
    expect(stale).toEqual([]);
  });

  it('preserves order in both buckets for a mixed list', () => {
    const rows = [
      invite('keep-1', GAME_B),
      signup('stale-1', GAME_C),
      signup('fresh', GAME_A),
      signup('stale-2', GAME_C),
    ];
    const { visible, stale } = partitionStaleSignupNotifications(
      rows,
      new Set([GAME_A, GAME_B]),
    );
    expect(ids(visible)).toEqual(['keep-1', 'fresh']);
    expect(ids(stale)).toEqual(['stale-1', 'stale-2']);
  });
});
