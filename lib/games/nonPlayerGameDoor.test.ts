import { describe, expect, it } from 'vitest';
import { nonPlayerGameDoor, type NonPlayerDoor } from '@/lib/games/nonPlayerGameDoor';

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
