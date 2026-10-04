import { describe, expect, it } from 'vitest';
import {
  adminCupMatchHref,
  nonPlayerGameDoor,
  organiserFollowsLiveBoard,
  type NonPlayerDoor,
} from '@/lib/games/nonPlayerGameDoor';
import type { GameStatus } from '@/lib/games/status';

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

describe('nonPlayerGameDoor, board surface (#2202, owner choice C)', () => {
  it.each<[status: GameStatus, isAdmin: boolean, isCreator: boolean, NonPlayerDoor]>([
    ['active', false, true, { kind: 'board' }],
    ['active', true, false, { kind: 'board' }],
    ['active', true, true, { kind: 'board' }],
    ['active', false, false, { kind: 'not_found' }],
    ['scheduled', false, true, { kind: 'redirect', href: '/games/g1' }],
    ['draft', false, true, { kind: 'redirect', href: '/games/g1' }],
    ['scheduled', false, false, { kind: 'not_found' }],
  ])('%s · admin=%s · creator=%s', (status, isAdmin, isCreator, expected) => {
    expect(
      nonPlayerGameDoor({ gameId: 'g1', isAdmin, isCreator, surface: 'board', status }),
    ).toEqual(expected);
  });
});

describe('organiserFollowsLiveBoard (#2202, owner choice C)', () => {
  it.each<[status: GameStatus, createdBy: string | null, viewerId: string | null, boolean]>([
    ['active', 'u1', 'u1', true],
    ['active', 'u2', 'u1', false], // the organiser of ANOTHER game
    ['active', null, 'u1', false],
    ['active', 'u1', null, false],
    ['active', '', '', false], // spectate and embed pass an empty viewer
    ['scheduled', 'u1', 'u1', false],
    ['finished', 'u1', 'u1', false], // finished boards have their own rule
  ])('%s · created_by=%s · viewer=%s → %s', (status, createdBy, viewerId, expected) => {
    expect(organiserFollowsLiveBoard({ status, createdBy, viewerId })).toBe(expected);
  });

  // Trap 4: the board door admits exactly the organisers the read rule serves.
  it.each<GameStatus>(['draft', 'scheduled', 'active'])(
    'door and read rule agree for a non-admin creator on a %s game',
    (status) => {
      const door = nonPlayerGameDoor({ gameId: 'g1', isAdmin: false, isCreator: true, surface: 'board', status });
      expect(door.kind === 'board').toBe(
        organiserFollowsLiveBoard({ status, createdBy: 'u1', viewerId: 'u1' }),
      );
    },
  );
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
