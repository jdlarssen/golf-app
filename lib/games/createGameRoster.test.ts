import { describe, it, expect } from 'vitest';
import type { PlayerOption } from '@/app/[locale]/admin/games/new/GameForm';
import { mergeCreateGameRoster } from './createGameRoster';

/**
 * Type A (#2018): the roster `/opprett-spill` works from — co-players ∪ friends
 * ∪ club members, deduped on id. The shortage banner and the wizard both read
 * this list, so the banner can no longer say «only 1 player» while the picker
 * right below lists friends.
 */

function option(
  id: string,
  overrides: Partial<Omit<PlayerOption, 'id'>> = {},
): PlayerOption {
  return {
    id,
    name: id,
    nickname: null,
    hcp_index: 18,
    pending: false,
    gender: null,
    level: 'normal',
    ...overrides,
  };
}

describe('mergeCreateGameRoster', () => {
  it('is empty when every source is empty', () => {
    expect(
      mergeCreateGameRoster({ coPlayers: [], friends: [], clubMembers: [] }),
    ).toEqual([]);
  });

  it('is just me for a brand-new user', () => {
    const me = option('meg', { isGuest: false });

    expect(
      mergeCreateGameRoster({ coPlayers: [me], friends: [], clubMembers: [] }),
    ).toEqual([me]);
  });

  it('keeps the co-player row when a friend is also a co-player', () => {
    // The co-player row comes from the users table and carries `isGuest`; the
    // friend row does not. The first source wins.
    const me = option('meg', { isGuest: false });
    const asCoPlayer = option('kari', { isGuest: false, nickname: 'K' });
    const asFriend = option('kari');

    expect(
      mergeCreateGameRoster({
        coPlayers: [me, asCoPlayer],
        friends: [asFriend],
        clubMembers: [],
      }),
    ).toEqual([me, asCoPlayer]);
  });

  it('does not add me twice when I am in my own club', () => {
    const me = option('meg', { isGuest: false });

    expect(
      mergeCreateGameRoster({
        coPlayers: [me],
        friends: [],
        clubMembers: [option('meg'), option('ola')],
      }),
    ).toEqual([me, option('ola')]);
  });

  it('orders co-players, then friends, then club members, deduped across all three', () => {
    const result = mergeCreateGameRoster({
      coPlayers: [option('meg'), option('per')],
      friends: [option('kari'), option('lise')],
      clubMembers: [option('lise'), option('ola'), option('per')],
    });

    expect(result.map((p) => p.id)).toEqual(['meg', 'per', 'kari', 'lise', 'ola']);
  });
});
