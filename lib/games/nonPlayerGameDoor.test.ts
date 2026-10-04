import { describe, expect, it } from 'vitest';
import {
  adminCupMatchHref,
  nonPlayerGameDoor,
  type NonPlayerDoor,
} from '@/lib/games/nonPlayerGameDoor';

describe('nonPlayerGameDoor (#2202)', () => {
  it.each<[surface: 'home' | 'player_page', isAdmin: boolean, isCreator: boolean, NonPlayerDoor]>([
    ['home', true, true, { kind: 'redirect', href: '/admin/games/g1' }],
    ['home', true, false, { kind: 'redirect', href: '/admin/games/g1' }],
    ['home', false, true, { kind: 'organiser_view' }],
    ['home', false, false, { kind: 'not_found' }],
    ['player_page', true, true, { kind: 'redirect', href: '/games/g1' }],
    ['player_page', true, false, { kind: 'redirect', href: '/games/g1' }],
    ['player_page', false, true, { kind: 'redirect', href: '/games/g1' }],
    ['player_page', false, false, { kind: 'not_found' }],
  ])('%s · admin=%s · creator=%s', (surface, isAdmin, isCreator, expected) => {
    expect(nonPlayerGameDoor({ gameId: 'g1', isAdmin, isCreator, surface })).toEqual(expected);
  });
});

describe('adminCupMatchHref (#2202)', () => {
  const base = { gameId: 'g1', tournamentId: 't1', viewerId: 'u1' };

  it('admin drills into the Sekretariat, whatever the match', () => {
    expect(
      adminCupMatchHref({ ...base, status: 'scheduled', viewerIsAdmin: true, createdBy: 'someone', playerIds: [] }),
    ).toBe('/admin/games/g1');
  });

  it.each(['scheduled', 'active', 'finished'] as const)(
    'the match creator who does not play (%s) goes to the game page',
    (status) => {
      expect(
        adminCupMatchHref({ ...base, status, viewerIsAdmin: false, createdBy: 'u1', playerIds: ['p1', 'p2'] }),
      ).toBe('/games/g1');
    },
  );

  it('a player in the match goes to the game page, whoever generated it', () => {
    expect(
      adminCupMatchHref({ ...base, status: 'scheduled', viewerIsAdmin: false, createdBy: 'admin-1', playerIds: ['u1', 'p2'] }),
    ).toBe('/games/g1');
  });

  // A global admin generated the matches of a personal cup: created_by is the
  // admin, so the cup's creator has no door on /games/[id] (it would 404).
  it.each([
    ['finished', '/games/g1/leaderboard?from=/admin/cup/t1'],
    ['active', null],
    ['scheduled', null],
  ] as const)('neither creator nor player, admin-generated match (%s) → %s', (status, expected) => {
    expect(
      adminCupMatchHref({ ...base, status, viewerIsAdmin: false, createdBy: 'admin-1', playerIds: ['p1', 'p2'] }),
    ).toBe(expected);
  });

  it('an unknown creator counts as not the viewer', () => {
    expect(
      adminCupMatchHref({ ...base, status: 'active', viewerIsAdmin: false, createdBy: null, playerIds: [] }),
    ).toBe(null);
  });
});
