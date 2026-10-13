import { describe, it, expect } from 'vitest';
import { createTranslator } from 'next-intl';
import messages from '@/messages/no.json';
import type { LiveBoardRow } from '@/lib/leaderboard/liveBoard';
import {
  behindLeaderText,
  boardDisplayName,
  followTotalLabel,
  sentenceName,
  type BoardCommonT,
  type BoardT,
  type FollowT,
} from './boardText';

// Type A (#2286): the board's text rules that the follow page adds or shares,
// with the real Norwegian messages.

const tf = createTranslator({ locale: 'no', messages, namespace: 'spectate.follow' }) as unknown as FollowT;
const t = createTranslator({ locale: 'no', messages, namespace: 'leaderboard.board' }) as unknown as BoardT;
const tc = createTranslator({ locale: 'no', messages, namespace: 'leaderboard.common' }) as unknown as BoardCommonT;

function row(userId: string, name: string, rank: number): LiveBoardRow {
  return {
    userId,
    name,
    nickname: null,
    rank,
    tied: false,
    total: 30 - rank,
    holesPlayed: 9,
    movement: null,
    recent: [],
    recentHoles: [],
  };
}

describe('followTotalLabel — the big total on the follow page', () => {
  it.each([
    ['points', 26, '26 p'],
    ['net', 74, '74 netto'],
    ['toPar', -2, '−2'],
    ['toPar', 0, 'E'],
    ['toPar', 3, '+3'],
    ['points', null, '—'],
    ['net', null, '—'],
  ] as const)('%s %s → %s', (unit, total, expected) => {
    expect(followTotalLabel(tf, unit, total)).toBe(expected);
  });
});

describe('behindLeaderText — who the gap is to', () => {
  const standing = { rank: 2, tied: false, fieldSize: 3, total: 27, holesPlayed: 9, leaderUserIds: ['a'], gap: 2 };
  const name = (r: LiveBoardRow) => boardDisplayName(r, tc);

  it('names the leader by first name', () => {
    const rows = [row('a', 'Marte Lie', 1), row('b', 'Jonas Berg', 2), row('c', 'Anders Moe', 3)];
    expect(behindLeaderText(t, standing, 'points', rows, name)).toBe('2 poeng bak Marte');
  });

  it('names the leader in full when another player on the board shares the first name', () => {
    const rows = [row('a', 'Marte Lie', 1), row('b', 'Jonas Berg', 2), row('c', 'Marte Dahl', 3)];
    expect(behindLeaderText(t, standing, 'points', rows, name)).toBe('2 poeng bak Marte Lie');
  });

  it('says «bak ledelsen» on a shared lead, and nothing without a gap', () => {
    const rows = [row('a', 'Marte Lie', 1), row('b', 'Jonas Berg', 1), row('c', 'Anders Moe', 3)];
    expect(behindLeaderText(t, { ...standing, leaderUserIds: ['a', 'b'] }, 'net', rows, name)).toBe('2 slag bak ledelsen');
    expect(behindLeaderText(t, { ...standing, gap: 0 }, 'points', rows, name)).toBeNull();
  });
});

describe('sentenceName — a player inside a sentence (#2275)', () => {
  const name = (r: LiveBoardRow) => boardDisplayName(r, tc);

  it('is the first name', () => {
    const rows = [row('a', 'Marte Lie', 1), row('b', 'Jonas Berg', 2)];
    expect(sentenceName(rows[0], rows, name)).toBe('Marte');
  });

  it('is the full name when another player on the board has the same first name', () => {
    const rows = [row('a', 'Marte Lie', 1), row('b', 'Jonas Berg', 2), row('c', 'Marte Dahl', 3)];
    expect(sentenceName(rows[0], rows, name)).toBe('Marte Lie');
    expect(sentenceName(rows[2], rows, name)).toBe('Marte Dahl');
    expect(sentenceName(rows[1], rows, name)).toBe('Jonas');
  });
});
