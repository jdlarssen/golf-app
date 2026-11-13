import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { EmbedBoard as EmbedBoardData } from '@/lib/embed/embedBoard';
import { EmbedBoard } from './EmbedBoard';

// Type C (#2330): the embed card's layout. The rows, names and who leads are
// tested in lib/embed/embedBoard.test.ts; the numbers in lib/leaderboard.

const board: EmbedBoardData = {
  unit: 'points',
  holesPlayed: 14,
  showPlace: true,
  fieldSize: 8,
  moreCount: 3,
  rows: Array.from({ length: 5 }, (_, i) => ({
    userId: `u${i + 1}`,
    rank: i + 1,
    tied: false,
    isLeader: i === 0,
    holesPlayed: 14,
    total: 31 - i,
    name: `Spiller ${i + 1}.`,
  })),
};

const props = {
  live: true,
  gameName: 'Klubbmesterskapet',
  formatLabel: 'Stableford',
  spectateHref: '/no/spectate/tok',
  prizes: [],
};

describe('EmbedBoard', () => {
  it('shows five rows, gold only on the leader and «Vis alle» in a new tab; the reveal card shows no rows', () => {
    const { rerender } = render(<EmbedBoard {...props} board={board} />);

    const rows = screen.getAllByTestId('embed-row');
    expect(rows).toHaveLength(5);
    expect(within(rows[0]).getByTestId('embed-leader')).toBeInTheDocument();
    expect(screen.getAllByTestId('embed-leader')).toHaveLength(1);

    const more = screen.getByTestId('embed-more');
    expect(more).toHaveAttribute('href', '/no/spectate/tok');
    expect(more).toHaveAttribute('target', '_blank');
    expect(screen.getByTestId('embed-live-link')).toHaveAttribute('target', '_blank');
    expect(screen.queryByTestId('embed-hidden')).not.toBeInTheDocument();

    rerender(<EmbedBoard {...props} board={null} />);
    expect(screen.getByTestId('embed-hidden')).toBeInTheDocument();
    expect(screen.queryAllByTestId('embed-row')).toHaveLength(0);
    expect(screen.queryByTestId('embed-more')).not.toBeInTheDocument();
  });
});
