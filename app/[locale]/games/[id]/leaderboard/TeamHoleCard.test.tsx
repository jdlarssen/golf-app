import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TeamHoleCard } from './TeamHoleCard';

// Type C (#2316): «Ditt lag på hull N» in the two variants that have it. The
// numbers are `scrambleHoleCard` / `bestBallHoleCard` (teamLiveBoard.test.ts).

describe('TeamHoleCard', () => {
  it('scramble: the strokes the team hit and their word, on gross', () => {
    render(<TeamHoleCard kind="scramble" holeNumber={11} strokes={3} term="birdie" overPar={-1} />);

    expect(screen.getByRole('heading', { name: 'Ditt lag på hull 11' })).toBeInTheDocument();
    expect(screen.getByTestId('team-hole-card')).toHaveTextContent('3 slag, birdie');
  });

  it('best ball: whose ball counted, and the team’s net with its word', () => {
    render(
      <TeamHoleCard
        kind="bestBall"
        holeNumber={8}
        net={6}
        term="bogey"
        overPar={1}
        names="Kristian"
      />,
    );

    expect(screen.getByRole('heading', { name: 'Ditt lag på hull 8' })).toBeInTheDocument();
    expect(screen.getByTestId('team-hole-card')).toHaveTextContent('Ballen til Kristian talte · netto 6, bogey');
    expect(screen.getByText('Kristian')).toHaveClass('font-semibold');
  });

  it('past a triple bogey the word is the difference', () => {
    render(<TeamHoleCard kind="scramble" holeNumber={4} strokes={9} term="over" overPar={4} />);

    expect(screen.getByTestId('team-hole-card')).toHaveTextContent('9 slag, +4');
  });
});
