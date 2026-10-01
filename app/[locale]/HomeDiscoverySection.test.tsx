import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HomeDiscoverySection } from './HomeDiscoverySection';
import type { DiscoverableOpenGame } from '@/lib/games/getDiscoverableGames';

function openGame(over: Partial<DiscoverableOpenGame>): DiscoverableOpenGame {
  return {
    id: 'g1',
    name: 'Turnering',
    short_id: 'abc123xy',
    scheduled_tee_off_at: '2026-10-03T07:20:00Z',
    course_name: null,
    registration_mode: 'open',
    game_mode: 'stableford',
    mode_config: { kind: 'stableford', team_size: 1, points_table: 'standard' },
    hole_segment: 'full',
    start_type: 'first_tee',
    ...over,
  };
}

describe('HomeDiscoverySection', () => {
  // Påmeldingsmåten ER synligheten (#357): knappen speiler modus, men begge
  // lenker til samme /signup-side som ruter videre på registration_mode.
  // #2258: terminliste-rader under en dagsoverskrift, ingen kilde-overskrifter.
  it('viser dagsgruppa med «Meld på» for open og «Be om plass» for manual_approval', () => {
    render(
      <HomeDiscoverySection
        data={{
          clubGames: [],
          openGames: [
            openGame({ id: 'g1', short_id: 'open0001', registration_mode: 'open' }),
            openGame({
              id: 'g2',
              short_id: 'appr0002',
              registration_mode: 'manual_approval',
            }),
          ],
          friendGames: [],
          pendingRequests: [],
        }}
        seats={new Map()}
        now={new Date('2026-10-01T10:00:00Z')}
      />,
    );

    const meldDeg = screen.getByRole('link', { name: 'Meld meg på Turnering' });
    const beOm = screen.getByRole('link', { name: 'Be om å bli med i Turnering' });

    expect(meldDeg).toHaveAttribute('href', '/signup/open0001');
    expect(meldDeg).toHaveTextContent('Meld på');
    expect(beOm).toHaveAttribute('href', '/signup/appr0002');
    expect(beOm).toHaveTextContent('Be om plass');

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/^Lørdag 3\. oktober/);
    expect(screen.queryByText('Åpne turneringer')).toBeNull();
  });
});
