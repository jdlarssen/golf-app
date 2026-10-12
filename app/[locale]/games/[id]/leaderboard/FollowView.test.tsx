import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { FollowView } from './FollowView';
import type { FollowViewData } from '@/lib/leaderboard/followPlayer';
import type { LiveBoard, LiveBoardRow } from '@/lib/leaderboard/liveBoard';

// Type C (#2286): the follow page's structure — the links, the selected flight
// button, the followed row and «Se hele tavla». The numbers come ready from
// lib/leaderboard/followPlayer.ts, which owns how they are computed.

function row(userId: string, rank: number, name: string): LiveBoardRow {
  return {
    userId,
    name,
    nickname: null,
    rank,
    tied: false,
    total: 27 - rank,
    holesPlayed: 11,
    movement: null,
    recent: ['par', 'under', 'over1', 'par', 'under'],
    recentHoles: [7, 8, 9, 10, 11].map((holeNumber, i) => ({
      holeNumber,
      gross: [4, 3, 5, 4, 3][i],
      par: 4,
      points: [2, 3, 1, 2, 3][i],
      net: null,
    })),
  };
}

const rows = [row('marte', 1, 'Marte Lie'), row('jonas', 2, 'Jonas Berg'), row('anders', 3, 'Anders Moe')];
const board: LiveBoard = { unit: 'points', holesPlayed: 11, rows };

const view: FollowViewData = {
  row: rows[1],
  standing: { rank: 2, tied: false, fieldSize: 3, total: 25, holesPlayed: 11, leaderUserIds: ['marte'], gap: 1 },
  lead: null,
  next: { kind: 'hole', holeNumber: 12, par: 4 },
  moment: 'birdie',
  others: [
    { row: rows[1], fullName: false },
    { row: rows[0], fullName: false },
  ],
};

describe('FollowView', () => {
  it('lays out the head, the last holes, the flight, «Se hele tavla» and the board as links to ?folg=', () => {
    render(
      <FollowView
        token="tok"
        board={board}
        view={view}
        subtitle="Lørdagsrunden · Byneset North"
        cta={<span data-testid="cta-slot" />}
      />,
    );

    // One heading, naming the followed player.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Jonas Berg/);

    // Five holes, the moment only on the newest.
    const holes = screen.getAllByTestId('follow-hole');
    expect(holes.map((h) => h.dataset.hole)).toEqual(['7', '8', '9', '10', '11']);
    expect(screen.getAllByTestId('follow-moment')).toHaveLength(1);
    expect(within(holes[4]).getByTestId('follow-moment')).toBeInTheDocument();
    expect(screen.getByTestId('follow-next')).toHaveAttribute('data-kind', 'hole');

    // The flight: the followed player first and selected.
    const others = screen.getAllByTestId('follow-other');
    expect(others.map((a) => a.getAttribute('href'))).toEqual([
      '/spectate/tok?folg=jonas',
      '/spectate/tok?folg=marte',
    ]);
    expect(others[0]).toHaveAttribute('aria-current', 'true');
    expect(others[1]).not.toHaveAttribute('aria-current');
    expect(within(screen.getByRole('navigation')).getAllByRole('link')).toHaveLength(2);

    // «Se hele tavla» goes back to the plain board, without ?folg.
    expect(screen.getByTestId('follow-see-board')).toHaveAttribute('href', '/spectate/tok');

    // The board: the followed row is marked and not a link; the others link on.
    const boardRows = screen.getAllByTestId('follow-board-row');
    expect(boardRows.map((r) => r.dataset.userId)).toEqual(['marte', 'jonas', 'anders']);
    expect(boardRows[1]).toHaveAttribute('data-followed', 'true');
    expect(within(boardRows[1]).queryByRole('link')).not.toBeInTheDocument();
    expect(within(boardRows[0]).getByRole('link')).toHaveAttribute('href', '/spectate/tok?folg=marte');
    expect(within(boardRows[2]).getByRole('link')).toHaveAttribute('href', '/spectate/tok?folg=anders');

    expect(screen.getByTestId('cta-slot')).toBeInTheDocument();
    expect(document.querySelector('[data-follow-view]')).not.toBeNull();
  });
});
