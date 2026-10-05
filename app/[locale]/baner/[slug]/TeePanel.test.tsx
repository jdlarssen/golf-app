import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TeePanel, type TeeView } from './TeePanel';

// ONE render test for the tee switch on the course card (#2277, Type C) —
// finished values as props, as the server sends them.

const TEES: TeeView[] = [
  {
    id: 't1',
    name: 'Tee one',
    color: 'yellow',
    status: 'status-1',
    ratings: [{ key: 'mens', label: 'M', value: 'rating-1', par: null }],
  },
  {
    id: 't2',
    name: 'Tee two',
    color: null,
    status: 'status-2',
    ratings: [
      { key: 'mens', label: 'M', value: 'rating-2', par: null },
      { key: 'ladies', label: 'L', value: 'rating-2l', par: 'par-2l' },
    ],
  },
];

describe('TeePanel (#2277)', () => {
  it('switches the status line and the ratings when chip 2 is tapped; only a coloured tee has a dot', () => {
    render(<TeePanel legend="legend" tees={TEES} />);

    const [one, two] = screen.getAllByRole('radio');
    expect(one).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('status-1')).toBeInTheDocument();
    expect(screen.getByText('rating-1')).toBeInTheDocument();

    const dot = one.querySelector('[data-tee-dot]');
    expect(dot).not.toBeNull();
    expect(dot).toHaveAttribute('aria-hidden', 'true');
    expect(two.querySelector('[data-tee-dot]')).toBeNull();

    fireEvent.click(two);

    expect(two).toHaveAttribute('aria-checked', 'true');
    expect(one).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('status-2')).toBeInTheDocument();
    expect(screen.queryByText('status-1')).not.toBeInTheDocument();
    expect(screen.getByText('rating-2l')).toBeInTheDocument();
    expect(screen.getByText('par-2l')).toBeInTheDocument();
    expect(screen.queryByText('rating-1')).not.toBeInTheDocument();
  });
});
