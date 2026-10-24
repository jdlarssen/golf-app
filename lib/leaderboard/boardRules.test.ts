import { describe, it, expect } from 'vitest';
import type { LiveBoardRow } from '@/lib/leaderboard/liveBoard';
import { boardRow as row } from '@/lib/leaderboard/__fixtures__/boardRow';
import {
  COLLAPSED_ROWS,
  boardRowSrParts,
  isBoardLeader,
  placeKind,
  sentenceName,
  totalLabel,
  visibleBoardRows,
} from './boardRules';

// Type A (#2579): the board's text-free rules, shared by the web and the app.
// Team rows (keyed on their team number) go through the same rules as player
// rows (keyed on their userId).

type TeamRow = { teamNumber: number; name: string; rank: number; tied: boolean; holesPlayed: number };
const team = (teamNumber: number, rank: number): TeamRow => ({
  teamNumber,
  name: `Lag ${teamNumber}`,
  rank,
  tied: false,
  holesPlayed: 11,
});
const byUser = (r: LiveBoardRow) => r.userId;
const byTeam = (r: TeamRow) => r.teamNumber;
const plainName = <R extends { name: string | null }>(r: R) => r.name ?? '';

describe('sentenceName — a row inside a sentence (#2275)', () => {
  it('is the first name', () => {
    const rows = [row('a', 'Marte Lie', 1), row('b', 'Jonas Berg', 2)];
    expect(sentenceName(rows[0], rows, plainName, byUser)).toBe('Marte');
  });

  it('is the full name when another player on the board has the same first name', () => {
    const rows = [row('a', 'Marte Lie', 1), row('b', 'Jonas Berg', 2), row('c', 'Marte Dahl', 3)];
    expect(sentenceName(rows[0], rows, plainName, byUser)).toBe('Marte Lie');
    expect(sentenceName(rows[2], rows, plainName, byUser)).toBe('Marte Dahl');
    expect(sentenceName(rows[1], rows, plainName, byUser)).toBe('Jonas');
  });

  // «Likt med Lag 4», «1 slag bak Lag 3»: never the bare «Lag».
  it.each([1, 2, 3, 4])('names team %i in full', (n) => {
    const rows = [team(1, 1), team(2, 2), team(3, 3), team(4, 4)];
    expect(sentenceName(rows[n - 1], rows, plainName, byTeam)).toBe(`Lag ${n}`);
  });
});

describe('visibleBoardRows — collapsing around the focused row', () => {
  const players = Array.from({ length: 9 }, (_, i) => row(`u${i + 1}`, `Spiller ${i + 1}`, i + 1));
  const teams = Array.from({ length: 9 }, (_, i) => team(i + 1, i + 1));

  it('keeps the top five, then a gap and the focused row', () => {
    const { visible, canCollapse } = visibleBoardRows(players, 'u8', false, byUser);
    expect(canCollapse).toBe(true);
    expect(visible.map((r) => (r === 'gap' ? 'gap' : r.userId))).toEqual(['u1', 'u2', 'u3', 'u4', 'u5', 'gap', 'u8']);
  });

  it('finds a team by its number', () => {
    const { visible } = visibleBoardRows(teams, 7, false, byTeam);
    expect(visible.map((r) => (r === 'gap' ? 'gap' : r.teamNumber))).toEqual([1, 2, 3, 4, 5, 'gap', 7]);
  });

  it('shows the top five alone when the focus is among them or missing', () => {
    expect(visibleBoardRows(teams, 3, false, byTeam).visible).toHaveLength(COLLAPSED_ROWS);
    expect(visibleBoardRows(players, null, false, byUser).visible).toHaveLength(COLLAPSED_ROWS);
  });

  it('shows everyone when asked, or when the field is six or fewer', () => {
    expect(visibleBoardRows(teams, 9, true, byTeam).visible).toHaveLength(9);
    const six = visibleBoardRows(players.slice(0, 6), 'u6', false, byUser);
    expect(six).toEqual({ visible: players.slice(0, 6), canCollapse: false });
  });
});

describe('placeKind and isBoardLeader — read rank, tie and holes, any row', () => {
  it.each([
    [{ rank: 1, tied: false, holesPlayed: 3 }, true, 'plain', true],
    [{ rank: 1, tied: true, holesPlayed: 3 }, true, 'tied', true],
    [{ rank: 4, tied: true, holesPlayed: 3 }, true, 'tied', false],
    [{ rank: 1, tied: false, holesPlayed: 0 }, false, 'none', false],
  ] as const)('%o, showRank %s → %s, leader %s', (r, showRank, kind, leader) => {
    expect(placeKind(r, showRank)).toBe(kind);
    expect(isBoardLeader(r)).toBe(leader);
    expect(isBoardLeader({ ...team(4, r.rank), holesPlayed: r.holesPlayed })).toBe(leader);
  });
});

// #2579: the order of a row's spoken line, one home for the web board's
// boardRowSr and the app's row label. Text-free: each surface words the parts.
describe('boardRowSrParts — the order of a row read aloud', () => {
  const r = { ...row('a', 'Marte Lie', 3), total: 15, movement: 2, recent: ['under', 'par', 'over1'] as ('under' | 'par' | 'over1')[], holesPlayed: 7 };

  it('place, number, movement, last holes, holes played, then you', () => {
    expect(boardRowSrParts({ row: r, unit: 'points', showRank: true, isYou: true })).toEqual([
      { key: 'place', rank: 3, tied: false },
      { key: 'total', total: { kind: 'points', value: 15 } },
      { key: 'movement', direction: 'up', count: 2 },
      { key: 'recent', tones: ['under', 'par', 'over1'] },
      { key: 'holes', count: 7 },
      { key: 'you' },
    ]);
  });

  it('a finished row adds the winner after the place and the note before you', () => {
    const parts = boardRowSrParts({
      row: { ...r, rank: 1, movement: null, recent: [] },
      unit: 'points',
      showRank: true,
      isYou: true,
      winner: true,
      hasNote: true,
    });
    expect(parts.map((p) => p.key)).toEqual(['place', 'winner', 'total', 'holes', 'note', 'you']);
  });

  it('leaves out the place before anyone has played', () => {
    expect(boardRowSrParts({ row: r, unit: 'points', showRank: false, isYou: false })[0].key).toBe('total');
  });

  it.each([
    ['points', 15, { kind: 'points', value: 15 }],
    ['net', 74, { kind: 'net', value: 74 }],
    ['toPar', 0, { kind: 'even' }],
    ['toPar', 2, { kind: 'over', value: 2 }],
    ['toPar', -3, { kind: 'under', value: 3 }],
    ['pointsToPar', 0, { kind: 'even' }],
    ['pointsToPar', 3, { kind: 'pointsOver', value: 3 }],
    ['pointsToPar', -2, { kind: 'pointsUnder', value: 2 }],
    ['points', null, { kind: 'none' }],
  ] as const)('%s %s → %o', (unit, total, expected) => {
    const total0 = boardRowSrParts({ row: { ...r, total }, unit, showRank: true, isYou: false })[1];
    expect(total0).toEqual({ key: 'total', total: expected });
  });

  it.each([
    [3, { key: 'movement', direction: 'up', count: 3 }],
    [-1, { key: 'movement', direction: 'down', count: 1 }],
    [0, { key: 'movement', direction: 'same', count: 0 }],
  ] as const)('movement %s → %o', (movement, expected) => {
    expect(boardRowSrParts({ row: { ...r, movement }, unit: 'points', showRank: true, isYou: false })[2]).toEqual(expected);
  });
});

describe('totalLabel — the board’s number (#2625)', () => {
  it.each([
    ['points', 15, '15'],
    ['net', 74, '74'],
    ['toPar', -2, '−2'],
    ['pointsToPar', 3, '+3'],
    ['pointsToPar', 0, 'E'],
    ['pointsToPar', -2, '−2'],
    ['pointsToPar', null, '—'],
  ] as const)('%s %s → %s', (unit, total, expected) => {
    expect(totalLabel(unit, total)).toBe(expected);
  });
});
