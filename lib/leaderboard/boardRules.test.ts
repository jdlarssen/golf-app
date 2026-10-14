import { describe, it, expect } from 'vitest';
import type { LiveBoardRow } from '@/lib/leaderboard/liveBoard';
import {
  COLLAPSED_ROWS,
  isBoardLeader,
  placeKind,
  sentenceName,
  visibleBoardRows,
} from './boardRules';

// Type A (#2579): the board's text-free rules, shared by the web and the app.
// Team rows (keyed on their team number) go through the same rules as player
// rows (keyed on their userId).

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
