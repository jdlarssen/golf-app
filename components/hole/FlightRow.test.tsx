import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FlightRow, type FlightRowProps } from './FlightRow';

const base: FlightRowProps = {
  playerId: 'u2',
  name: 'Tore',
  initial: 'T',
  extraStrokes: 1,
  score: null,
  par: 4,
  active: true,
  locked: false,
  points: null,
  onSelect: () => {},
};

describe('FlightRow', () => {
  it('is one pressed button while active, selects on tap, and is disabled when locked', () => {
    const onSelect = vi.fn();
    const { rerender } = render(<FlightRow {...base} onSelect={onSelect} />);

    const row = screen.getByTestId('flight-row');
    expect(row.tagName).toBe('BUTTON');
    expect(row.getAttribute('aria-pressed')).toBe('true');
    expect(row.getAttribute('data-active')).toBe('true');
    expect(screen.getByTestId('score-number')).toBeInTheDocument();
    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledWith('u2');

    rerender(<FlightRow {...base} active={false} locked submitted onSelect={onSelect} />);
    expect(row.getAttribute('aria-pressed')).toBe('false');
    expect((row as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('flight-row-submitted')).toBeInTheDocument();

    // #2635: a plus handicap shows the stroke it gives away; scratch shows none.
    expect(screen.getByTestId('flight-row-strokes').textContent).toBe('Får 1 slag');
    rerender(<FlightRow {...base} extraStrokes={-1} onSelect={onSelect} />);
    expect(screen.getByTestId('flight-row-strokes').textContent).toBe('Mister 1 slag');
    rerender(<FlightRow {...base} extraStrokes={0} onSelect={onSelect} />);
    expect(screen.queryByTestId('flight-row-strokes')).toBeNull();
  });
});
