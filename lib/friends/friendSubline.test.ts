import { describe, it, expect } from 'vitest';
import { friendSubline, type FriendSublineText } from './friendSubline';
import type { FriendStats } from './friendStats';

/**
 * Type A (#2267): the line under a friend on the web's friends page. The
 * words come from the caller; this locks which parts show and in what order.
 */

const TEXT: FriendSublineText = {
  noRounds: 'none yet',
  hcp: (hcp) => `HCP ${hcp}`,
  rounds: (count) => `${count} rounds`,
  lastPlayed: (iso) => `last ${iso.slice(0, 10)}`,
};

const stats = (roundsTogether: number, lastPlayedAt: string | null = null): FriendStats => ({
  roundsTogether,
  lastPlayedAt,
  lastGameName: roundsTogether > 0 ? 'Onsdagsgolfen' : null,
});

describe('friendSubline', () => {
  it.each([
    { label: 'unread numbers: no line', hcp: 9.4, stats: null, line: null },
    { label: 'no finished round together: says so, without HCP', hcp: 9.4, stats: stats(0), line: 'none yet' },
    { label: 'all parts, in order', hcp: 9.4, stats: stats(8, '2026-10-03T11:00:00Z'), line: 'HCP 9.4 · 8 rounds · last 2026-10-03' },
    { label: 'no handicap: the rest', hcp: null, stats: stats(8, '2026-10-03T11:00:00Z'), line: '8 rounds · last 2026-10-03' },
    { label: 'an undated round: no last played', hcp: 14.2, stats: stats(1), line: 'HCP 14.2 · 1 rounds' },
    { label: 'a plus handicap goes to the formatter as stored', hcp: -1.2, stats: stats(2), line: 'HCP -1.2 · 2 rounds' },
  ])('$label', ({ hcp, stats: s, line }) => {
    expect(friendSubline({ hcp, stats: s }, TEXT)).toBe(line);
  });
});
