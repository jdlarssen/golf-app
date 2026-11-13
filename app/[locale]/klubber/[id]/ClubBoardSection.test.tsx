import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ClubBoardSection } from './ClubBoardSection';
import { rankBoard } from '@/lib/stats/aeresbrett';

/**
 * Type C — «Klubbens æresbrett» on the club page (#2326 PR2): the heading
 * with the year, medallions for places 1–3, the viewer's place or the no-wins
 * line, and the rest of the top 10 behind «Se hele brettet».
 */

const rows = rankBoard([
  { userId: 'm', name: 'Marte Lie', count: 3 },
  { userId: 'j', name: 'Jonas Berg', count: 2 },
  { userId: 'a', name: 'Anders Moe', count: 1 },
  { userId: 'k', name: 'Kristian Holm', count: 1 },
  { userId: 'o', name: 'Ola Kompis', count: 1 },
]);

describe('ClubBoardSection (#2326)', () => {
  it('names the board with the year, unformatted', () => {
    render(<ClubBoardSection year={2026} rows={rows} me={null} />);
    expect(screen.getByRole('region', { name: 'Klubbens æresbrett · 2026' })).toBeInTheDocument();
  });

  it('shows three rows, with places and wins, and the rest behind the fold', () => {
    const { container } = render(<ClubBoardSection year={2026} rows={rows} me={null} />);
    const details = container.querySelector('details') as HTMLElement;
    const outside = [...container.querySelectorAll('li')].filter((li) => !details.contains(li));
    expect(outside.map((li) => li.getAttribute('data-place'))).toEqual(['1', '2', '3']);
    expect(within(outside[0]).getByText('Marte Lie')).toBeInTheDocument();
    expect(within(outside[0]).getByText('3 seire')).toBeInTheDocument();
    expect(within(outside[2]).getByText('1 seier')).toBeInTheDocument();
    expect(details).not.toHaveAttribute('open');
    expect(within(details).getAllByRole('listitem', { hidden: true }).map((li) => li.getAttribute('data-place'))).toEqual(['3', '3']);
  });

  it('says where you are, or that you have no wins this year', () => {
    const { rerender } = render(<ClubBoardSection year={2026} rows={rows} me={rows[1]} />);
    expect(screen.getByTestId('club-board-me')).toHaveTextContent('Du: 2. plass');
    rerender(<ClubBoardSection year={2026} rows={rows} me={null} />);
    // In the fold's line, without the full stop: «Ingen seire ennå i 2026 · Se hele brettet».
    expect(screen.getByTestId('club-board-me')).toHaveTextContent(/^Ingen seire ennå i 2026$/);
  });

  it('has no fold with three rows or fewer', () => {
    const { container } = render(<ClubBoardSection year={2025} rows={rows.slice(0, 2)} me={null} />);
    expect(container.querySelector('details')).toBeNull();
    expect(screen.getByTestId('club-board-me')).toHaveTextContent('Ingen seire ennå i 2025.');
  });

  it('stops at ten rows', () => {
    const many = rankBoard(
      Array.from({ length: 14 }, (_, i) => ({ userId: `u${i}`, name: `Spiller ${String(i).padStart(2, '0')}`, count: 20 - i })),
    );
    const { container } = render(<ClubBoardSection year={2026} rows={many} me={null} />);
    expect(container.querySelectorAll('li')).toHaveLength(10);
  });
});
