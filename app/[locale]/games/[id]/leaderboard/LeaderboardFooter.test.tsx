import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LeaderboardFooter } from './LeaderboardFooter';

// Status→nøkkel-mappingen er den eneste rene logikken i komponenten: ferdig
// spill → «Vel spilt!», alt annet → «Lykke til.». Speiler matchplay-familiens
// hasDecidedWinner-ternær (#605).
describe('LeaderboardFooter', () => {
  it('viser «Vel spilt!» når spillet er ferdig', () => {
    render(<LeaderboardFooter gameStatus="finished" />);
    expect(screen.getByText(/Vel spilt/)).toBeInTheDocument();
    expect(screen.queryByText(/Lykke til/)).not.toBeInTheDocument();
  });

  it('viser «Lykke til.» mens spillet er live/kommende', () => {
    for (const status of ['draft', 'scheduled', 'active'] as const) {
      const { unmount } = render(<LeaderboardFooter gameStatus={status} />);
      expect(screen.getByText(/Lykke til/)).toBeInTheDocument();
      expect(screen.queryByText(/Vel spilt/)).not.toBeInTheDocument();
      unmount();
    }
  });
});
