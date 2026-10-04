import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OnboardingGameCard } from './OnboardingGameCard';
import type { OnboardingGameCardData } from './getOnboardingGame';

// Type C — one render test for the game card on «Fullfør profilen» (#2350):
// the heading, the date tile in Oslo time, and no tile without a tee-off.

const game: OnboardingGameCardData = {
  gameId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  name: 'Lørdagsrunden',
  courseName: 'Byneset',
  // 22:30 UTC on 3 Oct is 00:30 on 4 Oct in Oslo (summer time).
  teeOffAt: '2026-10-03T22:30:00Z',
  gameMode: 'stableford',
  modeConfig: { kind: 'stableford', team_size: 1, points_table: 'standard' },
};

describe('OnboardingGameCard', () => {
  it('shows the heading, the Oslo date tile and the line; no tile without a tee-off', () => {
    const { rerender } = render(<OnboardingGameCard game={game} />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Lørdagsrunden venter på deg' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('onboarding-game-date')).toHaveTextContent('4okt');
    expect(screen.getByText('Byneset · kl. 00:30 · Stableford')).toBeInTheDocument();

    rerender(<OnboardingGameCard game={{ ...game, teeOffAt: null }} />);
    expect(screen.queryByTestId('onboarding-game-date')).toBeNull();
    expect(screen.getByText('Byneset · Stableford')).toBeInTheDocument();
  });
});
