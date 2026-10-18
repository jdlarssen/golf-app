import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('./flightActions', () => ({
  suggestTeamAssignment: vi.fn(),
  setPlayerTeam: vi.fn(),
}));

/**
 * #2569 (Type C): each team card says where it stands against the team-size
 * rule. Which status a size gets is `teamSizeStatus`'s (Type A, teamScope);
 * here only that the card shows a line for a short team and a warning line
 * for one outside the rule, and none for a full team.
 */
describe('LagSeksjon — lag mot lagstørrelsen (#2569)', () => {
  it('Texas à 4 med 4/3/2: fullt lag uten linje, kort lag med linje, for få med advarsel', async () => {
    const { LagSeksjon } = await import('./LagSeksjon');
    const players = [4, 3, 2].flatMap((count, t) =>
      Array.from({ length: count }, (_, m) => ({
        user_id: `t${t + 1}-${m}`,
        team_number: t + 1,
        withdrawn_at: null,
        displayName: `Spiller ${t + 1}.${m}`,
      })),
    );
    render(<LagSeksjon gameId="g1" teamSize={4} gameMode="texas_scramble" players={players} />);

    expect(screen.getByTestId('team-card-1').dataset.sizeStatus).toBe('full');
    expect(screen.queryByTestId('team-card-1-size-line')).toBeNull();
    expect(screen.getByTestId('team-card-2').dataset.sizeStatus).toBe('short');
    expect(screen.getByTestId('team-card-2-size-line')).toBeInTheDocument();
    expect(screen.getByTestId('team-card-3').dataset.sizeStatus).toBe('outside');
    expect(screen.getByTestId('team-card-3-size-line')).toBeInTheDocument();
  });
});
