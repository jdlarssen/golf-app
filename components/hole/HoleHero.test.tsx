import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HoleHero } from './HoleHero';

describe('HoleHero', () => {
  it('renders the hole number, par value, and stroke index', () => {
    render(<HoleHero holeNumber={7} par={4} strokeIndex={12} />);
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('Par 4')).toBeInTheDocument();
    expect(screen.getByText('indeks 12')).toBeInTheDocument();
  });

  it('shows the HULL kicker', () => {
    render(<HoleHero holeNumber={1} par={3} strokeIndex={1} />);
    expect(screen.getByText('HULL')).toBeInTheDocument();
  });

  it('renders separate par and index lines on the right', () => {
    render(<HoleHero holeNumber={9} par={5} strokeIndex={3} />);
    expect(screen.getByText('Par 5')).toBeInTheDocument();
    expect(screen.getByText('indeks 3')).toBeInTheDocument();
  });

  it('renders the mode context line in the header centre when provided (#639)', () => {
    render(
      <HoleHero
        holeNumber={4}
        par={4}
        strokeIndex={7}
        contextLine={<span data-testid="ctx">Segment 1/3</span>}
      />,
    );
    expect(screen.getByTestId('ctx')).toHaveTextContent('Segment 1/3');
    // Hull-tallet og Par/indeks står fortsatt — kontekst-linja erstatter dem ikke.
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('Par 4')).toBeInTheDocument();
  });
});
