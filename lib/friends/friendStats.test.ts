import { describe, it, expect } from 'vitest';
import {
  friendStatsFromRows,
  sortByLastPlayed,
  sortByRoundsTogether,
  visibleFriendHcp,
  type FriendStats,
  type SharedGame,
} from './friendStats';

/** Type A (#2256): the sublines and the order on the app's friends screen. */

const ANNE = 'anne';
const PER = 'per';

function game(id: string, over: Partial<SharedGame> = {}): SharedGame {
  return { id, name: `Spill ${id}`, scheduledTeeOffAt: null, endedAt: null, ...over };
}

describe('friendStatsFromRows', () => {
  it('counts the shared games and names the latest one', () => {
    const games = [
      game('g1', { name: 'Vårgolfen', endedAt: '2026-05-01T16:00:00Z' }),
      game('g2', { name: 'Onsdagsgolfen', scheduledTeeOffAt: '2026-09-23T15:00:00Z' }),
      game('g3', { name: 'Klubbmesterskap', endedAt: '2026-08-10T16:00:00Z' }),
    ];
    const rows = [
      { game_id: 'g1', user_id: ANNE },
      { game_id: 'g2', user_id: ANNE },
      { game_id: 'g3', user_id: ANNE },
      { game_id: 'g3', user_id: PER },
    ];
    const stats = friendStatsFromRows(games, rows);
    expect(stats.get(ANNE)).toEqual({
      roundsTogether: 3,
      lastPlayedAt: '2026-09-23T15:00:00Z',
      lastGameName: 'Onsdagsgolfen',
    });
    expect(stats.get(PER)).toEqual({
      roundsTogether: 1,
      lastPlayedAt: '2026-08-10T16:00:00Z',
      lastGameName: 'Klubbmesterskap',
    });
  });

  it('dates a round by its planned tee-off before its end, like the round list', () => {
    const games = [
      game('g1', { scheduledTeeOffAt: '2026-06-01T08:00:00Z', endedAt: '2026-09-01T08:00:00Z' }),
      game('g2', { endedAt: '2026-07-01T08:00:00Z' }),
    ];
    const rows = [
      { game_id: 'g1', user_id: ANNE },
      { game_id: 'g2', user_id: ANNE },
    ];
    expect(friendStatsFromRows(games, rows).get(ANNE)?.lastGameName).toBe('Spill g2');
  });

  it('keeps an undated shared game in the count without a last-played date', () => {
    const stats = friendStatsFromRows([game('g1')], [{ game_id: 'g1', user_id: ANNE }]);
    expect(stats.get(ANNE)).toEqual({ roundsTogether: 1, lastPlayedAt: null, lastGameName: 'Spill g1' });
  });

  it('ignores rows for games outside the shared list', () => {
    const stats = friendStatsFromRows([game('g1')], [{ game_id: 'annet', user_id: ANNE }]);
    expect(stats.has(ANNE)).toBe(false);
  });
});

describe('sortByLastPlayed', () => {
  it('puts the latest round first, then the ones never played, by name', () => {
    const people = [
      { name: 'Åse', lastPlayedAt: null },
      { name: 'Bjørn', lastPlayedAt: '2026-08-01T10:00:00Z' },
      { name: 'Anne', lastPlayedAt: null },
      { name: 'Cato', lastPlayedAt: '2026-09-20T10:00:00Z' },
    ];
    expect(sortByLastPlayed(people, (p) => p.lastPlayedAt).map((p) => p.name)).toEqual(['Cato', 'Bjørn', 'Anne', 'Åse']);
  });

  it('breaks a tie on the same day by name and leaves the input alone', () => {
    const people = [
      { name: 'Per', lastPlayedAt: '2026-09-20T10:00:00Z' },
      { name: 'Kari', lastPlayedAt: '2026-09-20T10:00:00Z' },
    ];
    expect(sortByLastPlayed(people, (p) => p.lastPlayedAt).map((p) => p.name)).toEqual(['Kari', 'Per']);
    expect(people[0].name).toBe('Per');
  });
});

const played = (roundsTogether: number, lastPlayedAt: string | null = null): FriendStats => ({
  roundsTogether,
  lastPlayedAt,
  lastGameName: roundsTogether > 0 ? 'Onsdagsgolfen' : null,
});

describe('sortByRoundsTogether (#2267)', () => {
  it.each([
    {
      label: 'most rounds first',
      people: [
        { name: 'Erik', stats: played(2) },
        { name: 'Ingrid', stats: played(5) },
      ],
      order: ['Ingrid', 'Erik'],
    },
    {
      label: 'the same count puts the latest round first',
      people: [
        { name: 'Anne', stats: played(2, '2026-08-01T10:00:00Z') },
        { name: 'Bjørn', stats: played(2, '2026-09-20T10:00:00Z') },
      ],
      order: ['Bjørn', 'Anne'],
    },
    {
      label: 'the same count and day goes by name, Norwegian order',
      people: [
        { name: 'Åse', stats: played(1, '2026-09-20T10:00:00Z') },
        { name: 'Øystein', stats: played(1, '2026-09-20T10:00:00Z') },
        { name: 'Zara', stats: played(1, '2026-09-20T10:00:00Z') },
      ],
      order: ['Zara', 'Øystein', 'Åse'],
    },
    {
      label: 'without numbers last, then by name',
      people: [
        { name: 'Per', stats: null },
        { name: 'Kari', stats: played(0) },
        { name: 'Ola', stats: played(1) },
      ],
      order: ['Ola', 'Kari', 'Per'],
    },
    { label: 'nobody gives nobody', people: [], order: [] },
  ])('$label', ({ people, order }) => {
    const before = people.map((p) => p.name);
    expect(sortByRoundsTogether(people, (p) => p.stats).map((p) => p.name)).toEqual(order);
    expect(people.map((p) => p.name)).toEqual(before);
  });
});

describe('visibleFriendHcp (#2267)', () => {
  it.each([
    { label: 'no shared finished round hides it', hcp: 9.4, stats: played(0), expected: null },
    { label: 'unread numbers hide it', hcp: 9.4, stats: null, expected: null },
    { label: 'one shared round shows it', hcp: 9.4, stats: played(1), expected: 9.4 },
    { label: 'a plus handicap shows as stored', hcp: -1.2, stats: played(3), expected: -1.2 },
    { label: 'no handicap stays none', hcp: null, stats: played(3), expected: null },
  ])('$label', ({ hcp, stats, expected }) => {
    expect(visibleFriendHcp(hcp, stats)).toBe(expected);
  });
});
