import { describe, it, expect } from 'vitest';
import { selectablePlayers, type SelectablePlayersCtx } from './selectablePlayers';
import type { PlayerOption } from '@/app/admin/games/new/GameForm';

function mk(id: string): PlayerOption {
  return {
    id,
    name: id,
    nickname: null,
    hcp_index: 10,
    pending: false,
    gender: null,
    level: 'normal',
  };
}

const SELF = mk('self');
const FRIEND_A = mk('friend-a');
const FRIEND_B = mk('friend-b');
const CLUB_X1 = mk('club-x1');
const CLUB_X2 = mk('club-x2');
const STRANGER = mk('stranger');

const ROSTER: PlayerOption[] = [SELF, FRIEND_A, FRIEND_B, CLUB_X1, CLUB_X2, STRANGER];

function ctx(over: Partial<SelectablePlayersCtx>): SelectablePlayersCtx {
  return {
    intent: 'kompis',
    groupId: '',
    selfId: 'self',
    players: ROSTER,
    friendIds: new Set(['friend-a', 'friend-b']),
    clubMemberIdsByClub: { 'club-x': new Set(['self', 'club-x1', 'club-x2']) },
    ...over,
  };
}

function ids(rows: PlayerOption[]): string[] {
  return rows.map((r) => r.id);
}

describe('selectablePlayers', () => {
  it.each([
    ['kompis', 'kompis' as const],
    ['cup', 'cup' as const],
  ])('%s → only friends + self (no strangers)', (_label, intent) => {
    expect(ids(selectablePlayers(ctx({ intent })))).toEqual([
      'self',
      'friend-a',
      'friend-b',
    ]);
  });

  it('klubb with a selected club that has members → only club members (+ self)', () => {
    const rows = selectablePlayers(ctx({ intent: 'klubb', groupId: 'club-x' }));
    expect(ids(rows)).toEqual(['self', 'club-x1', 'club-x2']);
  });

  it('klubb with a selected club NOT in the member map → falls back to friends + self', () => {
    const rows = selectablePlayers(
      ctx({ intent: 'klubb', groupId: 'unknown-club' }),
    );
    expect(ids(rows)).toEqual(['self', 'friend-a', 'friend-b']);
  });

  it('klubb with no club selected (empty groupId) → friends + self', () => {
    const rows = selectablePlayers(ctx({ intent: 'klubb', groupId: '' }));
    expect(ids(rows)).toEqual(['self', 'friend-a', 'friend-b']);
  });

  it('solo → whole roster unchanged (deferred removal; includes strangers)', () => {
    const rows = selectablePlayers(ctx({ intent: 'solo' }));
    expect(ids(rows)).toEqual(ids(ROSTER));
  });

  it('undefined intent (not picked yet) → friends + self (never the whole base)', () => {
    const rows = selectablePlayers(ctx({ intent: undefined }));
    expect(ids(rows)).toEqual(['self', 'friend-a', 'friend-b']);
  });

  it('kompis with no friends → only self', () => {
    const rows = selectablePlayers(ctx({ intent: 'kompis', friendIds: new Set() }));
    expect(ids(rows)).toEqual(['self']);
  });

  it('klubb with a club that has no other members → only self', () => {
    const rows = selectablePlayers(
      ctx({
        intent: 'klubb',
        groupId: 'club-empty',
        clubMemberIdsByClub: { 'club-empty': new Set(['self']) },
      }),
    );
    expect(ids(rows)).toEqual(['self']);
  });

  it('self is always present in non-solo contexts even when not a friend/member', () => {
    // friendIds excludes self by definition; club set excludes self here too.
    const rows = selectablePlayers(
      ctx({
        intent: 'klubb',
        groupId: 'club-x',
        clubMemberIdsByClub: { 'club-x': new Set(['club-x1']) },
      }),
    );
    expect(ids(rows)).toContain('self');
    expect(ids(rows)).toEqual(['self', 'club-x1']);
  });

  it('preserves the roster order of the filtered subset', () => {
    const rows = selectablePlayers(
      ctx({ intent: 'kompis', friendIds: new Set(['stranger', 'friend-a']) }),
    );
    // stranger sits after friend-a/b in ROSTER → order follows the roster, not friendIds
    expect(ids(rows)).toEqual(['self', 'friend-a', 'stranger']);
  });
});
