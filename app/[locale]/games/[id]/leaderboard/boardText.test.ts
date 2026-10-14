import { describe, it, expect } from 'vitest';
import { createTranslator } from 'next-intl';
import messages from '@/messages/no.json';
import type { LiveBoardRow } from '@/lib/leaderboard/liveBoard';
import {
  behindLeaderText,
  boardDisplayName,
  boardRowSr,
  followTotalLabel,
  pillText,
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

describe('pillText — the live pill (#2275)', () => {
  // Echoes the key and its arguments, so the test reads the rule, not the copy.
  const echo = ((key: string, args?: Record<string, unknown>) =>
    args ? `${key} ${JSON.stringify(args)}` : key) as unknown as BoardT;

  it.each([
    [null, 'pillLive'],
    [0, 'pillLive'],
    [7, 'pillLiveAfter {"holes":7}'],
  ] as const)('%s holes played → %s', (holes, expected) => {
    expect(pillText(echo, holes)).toBe(expected);
  });
});

// #2579: the screen-reader line per row, locked before its order moved to
// lib/leaderboard/boardRules.ts (the app reads the same order).
describe('boardRowSr — one spoken line per board row', () => {
  const base = row('a', 'Marte Lie', 3);
  it.each([
    [
      'points, up, the last holes, you',
      { row: { ...base, total: 15, movement: 2, recent: ['under', 'par', 'over1', 'over2'] as const, holesPlayed: 7 }, unit: 'points', showRank: true, isYou: true },
      '3. plass. 15 poeng. Opp 2 plasser siden forrige hull. Siste hull: under par, par, bogey, dobbel bogey eller verre. 7 hull spilt. Dette er deg',
    ],
    [
      'shared place, under par, down one',
      { row: { ...base, rank: 4, tied: true, total: -3, movement: -1, holesPlayed: 7 }, unit: 'toPar', showRank: true, isYou: false },
      'Delt 4. plass. 3 under par. Ned 1 plass siden forrige hull. 7 hull spilt',
    ],
    [
      'before anyone has played',
      { row: { ...base, total: null, movement: 0, holesPlayed: 0 }, unit: 'net', showRank: false, isYou: false },
      'Ingen hull spilt ennå. Uendret siden forrige hull. 0 hull spilt',
    ],
    ['even', { row: { ...base, total: 0 }, unit: 'toPar', showRank: true, isYou: false }, '3. plass. På par. 9 hull spilt'],
    ['over par', { row: { ...base, total: 2 }, unit: 'toPar', showRank: true, isYou: false }, '3. plass. 2 over par. 9 hull spilt'],
    ['net strokes', { row: { ...base, total: 74 }, unit: 'net', showRank: true, isYou: false }, '3. plass. 74 slag netto. 9 hull spilt'],
  ] as const)('%s', (_name, opts, expected) => {
    expect(boardRowSr(t, tc, { ...opts, row: { ...opts.row, recent: [...opts.row.recent] } })).toBe(expected);
  });
});
