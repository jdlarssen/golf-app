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
  const base = { gameId: 'g1', tournamentId: 't1' };

  it('admin drills into the Sekretariat, whatever the match status', () => {
    expect(
      adminCupMatchHref({ ...base, status: 'scheduled', groupId: 'c1', viewerIsAdmin: true }),
    ).toBe('/admin/games/g1');
  });

  it.each(['scheduled', 'active', 'finished'] as const)(
    'non-admin on a personal cup (%s) goes to the game page',
    (status) => {
      expect(
        adminCupMatchHref({ ...base, status, groupId: null, viewerIsAdmin: false }),
      ).toBe('/games/g1');
    },
  );

  it.each([
    ['finished', '/games/g1/leaderboard?from=/admin/cup/t1'],
    ['active', null],
    ['scheduled', null],
  ] as const)('non-admin on a club cup (%s) → %s', (status, expected) => {
    expect(
      adminCupMatchHref({ ...base, status, groupId: 'c1', viewerIsAdmin: false }),
    ).toBe(expected);
  });
});
