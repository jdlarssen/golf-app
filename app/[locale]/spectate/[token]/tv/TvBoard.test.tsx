import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import type { LiveBoardRow } from '@/lib/leaderboard/liveBoard';
import { TV_PAGE_MS } from '@/lib/leaderboard/tvBoard';
import { TvBoard } from './TvBoard';

// Type C (#2275): the big screen's board turns its pages by itself. Paging
// and the numbers are tested in lib/leaderboard (tvBoard.test.ts, liveBoard.test.ts).

const rows: LiveBoardRow[] = Array.from({ length: 14 }, (_, i) => ({
  userId: `u${i + 1}`,
  name: `Spiller ${i + 1}`,
  nickname: null,
  rank: i + 1,
  tied: false,
  total: 30 - i,
  holesPlayed: 11,
  movement: null,
  recent: [],
  recentHoles: [],
}));

const shownNames = () =>
  screen.getAllByTestId('tv-row').map((li) => li.getAttribute('data-user-id'));

describe('TvBoard', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows five players with the leader’s medallion, then turns to page two', () => {
    render(<TvBoard board={{ unit: 'points', holesPlayed: 11, rows }} />);

    expect(shownNames()).toEqual(['u1', 'u2', 'u3', 'u4', 'u5']);
    expect(within(screen.getAllByTestId('tv-row')[0]).getByTestId('tv-medallion')).toHaveTextContent('1');
    expect(screen.getAllByTestId('tv-medallion')).toHaveLength(1);
    expect(screen.getByTestId('tv-paging')).toHaveTextContent(
      'Side 1 av 3 · bytter hvert 10. sekund · 14 spillere',
    );

    act(() => vi.advanceTimersByTime(TV_PAGE_MS));

    expect(shownNames()).toEqual(['u6', 'u7', 'u8', 'u9', 'u10']);
    expect(screen.getByTestId('tv-paging')).toHaveTextContent('Side 2 av 3');
  });
});
