import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  ArrangementView,
  ClubsView,
  ToolsView,
  type ArrangedGame,
} from './PlayerKlubbhusViews';
import type { MyClub } from '@/lib/clubs/getMyClubs';

// One render test covering the three personas the adaptive player Klubbhuset
// room (#892) varies on — joiner / club member / arranger — by injecting data
// props into the presentational views. Asserts on data-testid/role/href only,
// never on Norwegian copy (Type C discipline). No Supabase mock.

const CLUBS: MyClub[] = [
  { id: 'club-1', name: 'Oslo Golfklubb', short_id: 'OGK', role: 'member' },
  { id: 'club-2', name: 'Bærum GK', short_id: 'BGK', role: 'owner' },
];

const GAMES: ArrangedGame[] = Array.from({ length: 4 }, (_, i) => ({
  id: `game-${i + 1}`,
  name: `Runde ${i + 1}`,
  courseName: 'Losby',
  status: 'active' as const,
}));

describe('PlayerKlubbhus adaptive room (#892)', () => {
  it('K1 — joiner (0 clubs / 0 created): invitation + cup link + «no club» line + tools, no list', () => {
    render(
      <>
        <ArrangementView games={[]} hasMore={false} cupCount={0} />
        <ClubsView clubs={[]} />
        <ToolsView />
      </>,
    );

    // Invitation hero, never an empty list.
    expect(screen.getByTestId('player-invite-primary')).toHaveAttribute(
      'href',
      '/opprett-spill',
    );
    expect(screen.getByTestId('player-invite-cup')).toHaveAttribute(
      'href',
      '/opprett-spill?intent=cup',
    );

    // No arranged content, no cup row, no overflow, no «+ Ny runde».
    expect(screen.queryByTestId('player-arranged-game')).toBeNull();
    expect(screen.queryByTestId('player-cup-row')).toBeNull();
    expect(screen.queryByTestId('player-see-all')).toBeNull();
    expect(screen.queryByTestId('player-new-round')).toBeNull();

    // Door to clubs stays open even with no membership.
    expect(screen.getByTestId('player-no-club')).toHaveAttribute('href', '/klubber');
    expect(screen.queryByTestId('player-club-row')).toBeNull();

    // Tools always present, carrying the Klubbhuset origin (#2487).
    expect(screen.getByRole('link', { name: /baner/i })).toHaveAttribute(
      'href',
      '/opprett-bane?kilde=klubbhuset',
    );
    expect(screen.getByRole('link', { name: /spillformater/i })).toHaveAttribute(
      'href',
      '/spillformater?kilde=klubbhuset',
    );
  });

  it('K2 — club member: clubs render as inline rows linking to each club page', () => {
    render(<ClubsView clubs={CLUBS} />);

    const rows = screen.getAllByTestId('player-club-row');
    expect(rows).toHaveLength(CLUBS.length);
    expect(rows[0]).toHaveAttribute('href', '/klubber/club-1?kilde=klubbhuset');
    expect(rows[1]).toHaveAttribute('href', '/klubber/club-2?kilde=klubbhuset');

    // The «no club» fallback is gone once you belong to a club.
    expect(screen.queryByTestId('player-no-club')).toBeNull();
  });

  it('K3 — arranger (≥1 created, >cap, ≥1 cup): capped list + «+ Ny runde» + «Se alle» + cup row, no hero', () => {
    render(<ArrangementView games={GAMES} hasMore={true} cupCount={2} />);

    // Capped list of created games, each linking to its game home.
    const gameRows = screen.getAllByTestId('player-arranged-game');
    expect(gameRows).toHaveLength(4);
    expect(gameRows[0]).toHaveAttribute('href', '/games/game-1');

    // Quiet «+ Ny runde» affordance instead of the hero invitation.
    expect(screen.getByTestId('player-new-round')).toHaveAttribute(
      'href',
      '/opprett-spill',
    );
    expect(screen.queryByTestId('player-invite-primary')).toBeNull();

    // Overflow to /klubbhuset and the cup discoverability row.
    expect(screen.getByTestId('player-see-all')).toHaveAttribute('href', '/klubbhuset');
    expect(screen.getByTestId('player-cup-row')).toHaveAttribute('href', '/admin/cup');
  });

  it('cup row appears with ≥1 cup even when there are no created games', () => {
    render(<ArrangementView games={[]} hasMore={false} cupCount={1} />);
    expect(screen.getByTestId('player-invite-primary')).toBeInTheDocument();
    expect(screen.getByTestId('player-cup-row')).toHaveAttribute('href', '/admin/cup');
  });

  // #2490: a failed read shows its own error box, never the empty state, and
  // never hides what the other read fetched.
  it('a failed read shows an error box instead of the empty state', () => {
    const games = render(<ArrangementView games={null} hasMore={false} cupCount={2} />);
    expect(screen.getByTestId('klubbhus-arrangement-error')).toBeInTheDocument();
    expect(screen.getByTestId('player-cup-row')).toBeInTheDocument();
    expect(screen.queryByTestId('player-invite-primary')).toBeNull();
    games.unmount();

    const cups = render(
      <ArrangementView games={GAMES.slice(0, 1)} hasMore={false} cupCount={null} />,
    );
    expect(screen.getByTestId('player-arranged-game')).toBeInTheDocument();
    expect(screen.getByTestId('klubbhus-cups-error')).toBeInTheDocument();
    expect(screen.queryByTestId('player-cup-row')).toBeNull();
    cups.unmount();

    render(<ClubsView clubs={null} />);
    expect(screen.getByTestId('klubbhus-clubs-error')).toBeInTheDocument();
    expect(screen.queryByTestId('player-no-club')).toBeNull();
  });
});
