import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReadyList, type ReadyRow } from './ReadyList';

// Type C (#2483): the layout of «Klar for i morgen?» only. What each row says
// is Type A in readyView.test.ts. One row per line, the mark by tone, «Purr»
// as a button at the end of a waiting row, «Purret» in its place right after,
// and the two links under the card.

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }) }));

const rows: ReadyRow[] = [
  { key: 'c', testId: 'ready-row-confirmed', tone: 'ok', title: 'A', sub: 'a' },
  {
    key: 'u1',
    testId: 'ready-row-unanswered',
    tone: 'warn',
    title: 'B',
    sub: null,
    remind: { action: vi.fn(), name: 'Kari' },
  },
  {
    key: 'u2',
    testId: 'ready-row-unanswered',
    tone: 'warn',
    title: 'C',
    sub: null,
    remind: { action: vi.fn(), name: 'Ola' },
    purredLabel: 'Purret',
  },
  { key: 'f', testId: 'ready-row-flights', tone: 'ok', title: 'D', sub: 'd' },
];

describe('ReadyList', () => {
  it('draws the rows with their marks, «Purr» on a waiting row, «Purret» after, and the two links', () => {
    render(
      <ReadyList
        rows={rows}
        links={[
          { key: 'm', href: '/games/g1/flytt', label: 'Flytt runden', testId: 'ready-move-link' },
          { key: 's', href: '/admin/games/g1/startlista', label: 'Se startlista', testId: 'ready-startlista-link' },
        ]}
      />,
    );

    const items = screen.getAllByRole('listitem');
    expect(items.map((li) => [li.dataset.testid, li.dataset.tone, li.querySelector('[aria-hidden]')?.textContent])).toEqual([
      ['ready-row-confirmed', 'ok', '✓'],
      ['ready-row-unanswered', 'warn', '!'],
      ['ready-row-unanswered', 'warn', '!'],
      ['ready-row-flights', 'ok', '✓'],
    ]);
    expect(screen.getAllByTestId('ready-purr-button').map((b) => b.textContent)).toEqual(['Purr Kari']);
    expect(screen.getByRole('status').textContent).toBe('Purret');
    expect(
      [screen.getByTestId('ready-move-link'), screen.getByTestId('ready-startlista-link')].map((a) =>
        a.getAttribute('href'),
      ),
    ).toEqual(['/games/g1/flytt', '/admin/games/g1/startlista']);
  });
});
