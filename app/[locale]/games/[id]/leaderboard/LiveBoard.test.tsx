import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { LiveBoard, type LiveBoardProps } from './LiveBoard';
import type { LiveBoard as LiveBoardData, LiveBoardRow } from '@/lib/leaderboard/liveBoard';

// Type C (#2253): the board's structure — the viewer's row, collapsing, the
// strip. The numbers are fed in ready; lib/leaderboard/liveBoard.test.ts owns
// how they are computed.

function rows(count: number): LiveBoardRow[] {
  return Array.from({ length: count }, (_, i) => ({
    userId: `u${i + 1}`,
    name: `Spiller ${i + 1}`,
    nickname: null,
    rank: i + 1,
    tied: false,
    total: 20 - i,
    holesPlayed: 7,
    movement: 0,
    recent: ['par', 'under', 'over1'],
  }));
}

function props(overrides: Partial<LiveBoardProps> = {}, board?: Partial<LiveBoardData>): LiveBoardProps {
  return {
    gameName: 'Lørdagsrunden',
    status: 'active',
    statusLabel: 'Planlagt',
    formatLabel: 'Stableford',
    flights: 3,
    board: { unit: 'points', holesPlayed: 7, rows: rows(9), ...board },
    viewerUserId: 'u9',
    strip: { kind: 'hole', holeNumber: 7, href: '/games/g1/holes/7' },
    backHref: '/games/g1',
    testId: 'stableford-leaderboard',
    ...overrides,
  };
}

const boardItems = () => within(screen.getByTestId('stableford-leaderboard')).queryAllByRole('listitem');

describe('LiveBoard', () => {
  it('collapses to the top five plus the viewer’s own row, and expands on tap', () => {
    render(<LiveBoard {...props()} />);

    // Five rows, the «…» gap (hidden from screen readers) and the viewer.
    expect(boardItems()).toHaveLength(6);
    const own = boardItems()[5];
    expect(within(own).getByText('Spiller 9')).toBeInTheDocument();
    expect(within(own).getByText('Du')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Vis alle 9 spillere' }));
    expect(boardItems()).toHaveLength(9);
    expect(screen.getByRole('button', { name: 'Vis færre' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows everyone and no toggle with six players or fewer', () => {
    render(<LiveBoard {...props({}, { rows: rows(6) })} />);

    expect(boardItems()).toHaveLength(6);
    expect(screen.queryByRole('button', { name: /Vis alle/ })).not.toBeInTheDocument();
  });

  it.each([
    [{ kind: 'hole', holeNumber: 7, href: '/games/g1/holes/7' } as const, 'Hull 7 →', '/games/g1/holes/7'],
    [{ kind: 'submit', href: '/games/g1/submit' } as const, 'Lever scorekort →', '/games/g1/submit'],
  ])('the strip links on: %s', (strip, label, href) => {
    render(<LiveBoard {...props({ strip })} />);

    expect(screen.getByText('Din runde')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
  });

  it('the strip has no button after delivery, and is gone without a strip or on public views', () => {
    const { rerender } = render(<LiveBoard {...props({ strip: { kind: 'none' } })} />);
    expect(screen.getByText('Din runde')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /→/ })).not.toBeInTheDocument();

    rerender(<LiveBoard {...props({ strip: null })} />);
    expect(screen.queryByText('Din runde')).not.toBeInTheDocument();

    // Spectate/embed: no viewer, so neither a strip nor a «Du» row.
    rerender(<LiveBoard {...props({ viewerUserId: '' })} />);
    expect(screen.queryByText('Din runde')).not.toBeInTheDocument();
    expect(screen.queryByText('Du')).not.toBeInTheDocument();
  });

  it('net to par shows signed numbers and «E» under the NETTO heading', () => {
    const toPar = rows(2).map((r, i) => ({ ...r, total: i === 0 ? -2 : 0 }));
    render(<LiveBoard {...props({}, { unit: 'toPar', rows: toPar })} />);

    expect(screen.getByText('Netto')).toBeInTheDocument();
    expect(within(boardItems()[0]).getByText('−2')).toBeInTheDocument();
    expect(within(boardItems()[1]).getByText('E')).toBeInTheDocument();
  });

  it('without a reactions provider the plate is not a button', () => {
    render(<LiveBoard {...props()} />);

    expect(screen.queryByRole('button', { name: /Reaksjoner til/ })).not.toBeInTheDocument();
  });
});
