import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RevealHiddenView } from './RevealHiddenView';

// Audit 2026-11-20: the blind view listens for the game finishing, so the
// reveal comes without a reload. The stub shows which game it listens to.
vi.mock('./PreRoundLeaderboard', () => ({
  PreRoundLeaderboardRealtime: ({ gameId }: { gameId: string }) => (
    <span data-testid="reveal-listener" data-game-id={gameId} />
  ),
}));

describe('RevealHiddenView', () => {
  it('renders the blind-cup-day placeholder heading and description, with no team data', () => {
    render(<RevealHiddenView gameId="g1" gameName="Nord vs Sør" backHref="/games/g1" />);

    expect(screen.getByText('Avsløres til slutt')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Stillingen holdes hemmelig til arrangøren avslutter spillet.',
      ),
    ).toBeInTheDocument();
    // No team/score data of any kind leaks into this view.
    expect(screen.queryByText(/Lag \d/)).not.toBeInTheDocument();
    // The view listens for the game finishing (games UPDATE → refresh).
    expect(screen.getByTestId('reveal-listener').dataset.gameId).toBe('g1');
  });
});
