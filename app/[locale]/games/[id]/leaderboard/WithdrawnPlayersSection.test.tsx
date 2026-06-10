import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WithdrawnPlayersSection } from './WithdrawnPlayersSection';

/**
 * Type-C render test (max one) — #386 WD leaderboard section.
 * Verifies: names + «Trukket» badge render when given players; nothing
 * rendered when list is empty.
 */
describe('WithdrawnPlayersSection', () => {
  it('renders player names and «Trukket» badge when list is non-empty', () => {
    render(
      <WithdrawnPlayersSection
        players={[
          { user_id: 'u1', display_name: 'Ola Nordmann' },
          { user_id: 'u2', display_name: 'Kari Hansen' },
        ]}
      />,
    );

    expect(screen.getByText('Ola Nordmann')).toBeDefined();
    expect(screen.getByText('Kari Hansen')).toBeDefined();
    // Both players get the badge — getAllByText returns one per player.
    const badges = screen.getAllByText('Trukket');
    expect(badges.length).toBe(2);
  });

  it('renders nothing when players list is empty', () => {
    const { container } = render(<WithdrawnPlayersSection players={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
