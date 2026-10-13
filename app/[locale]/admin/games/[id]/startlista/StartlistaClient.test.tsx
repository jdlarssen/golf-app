import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { StartlistaClient, type StartlistaPlayer } from './StartlistaClient';

vi.mock('../flightActions', () => ({
  setPlayerFlight: vi.fn(),
  suggestFlightAssignment: vi.fn(),
}));

function player(id: string, name: string, flight: number | null): StartlistaPlayer {
  return {
    user_id: id,
    flight_number: flight,
    withdrawn_at: null,
    hcpIndex: 10,
    shortName: name.split(' ')[0],
    fullName: name,
    initials: 'XX',
  };
}

// Flight 1 is full and holds Marte, flight 2 has room, Kristian has no flight.
const PLAYERS = [
  player('m', 'Marte Lie', 1),
  player('j', 'Jonas Berg', 1),
  player('a', 'Anders Moe', 1),
  player('s', 'Sigrid Aas', 1),
  player('p', 'Per Dahl', 2),
  player('k', 'Kristian Holm', null),
];

/** Type C (#2289): selecting gives the right targets, and Esc lets go. */
describe('StartlistaClient', () => {
  it('trykk på en brikke velger den og viser bare flighter med plass som mål; Esc slipper', () => {
    render(<StartlistaClient gameId="g" players={PLAYERS} focus={null} headingId="h" />);

    const chip = screen.getByRole('button', { name: 'Marte Lie, HCP 10,0' });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');

    // Own (and full) flight 1 is no target; flight 2 and the empty extra flight are.
    const targets = screen
      .getAllByRole('button', { name: /^Flytt Marte Lie til flight/ })
      .map((b) => b.getAttribute('aria-label'));
    expect(targets).toEqual(['Flytt Marte Lie til flight 2', 'Flytt Marte Lie til flight 3']);
    expect(within(screen.getByRole('status')).getByText(/Marte er valgt/)).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryAllByRole('button', { name: /^Flytt Marte Lie til flight/ })).toHaveLength(0);
  });
});
