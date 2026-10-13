import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { StartlistaClient, type StartlistaPlayer } from './StartlistaClient';

const { setPlayerFlightMock } = vi.hoisted(() => ({ setPlayerFlightMock: vi.fn() }));
vi.mock('../flightActions', () => ({
  setPlayerFlight: (...args: unknown[]) => setPlayerFlightMock(...args),
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

// Flight 1 is full and holds Marte, flight 2 has only Per, Kristian has no flight.
const PLAYERS = [
  player('m', 'Marte Lie', 1),
  player('j', 'Jonas Berg', 1),
  player('a', 'Anders Moe', 1),
  player('s', 'Sigrid Aas', 1),
  player('p', 'Per Holm', 2),
  player('k', 'Kristian Holm', null),
];

const chip = (c: HTMLElement, id: string) =>
  c.querySelector<HTMLButtonElement>(`button[data-user-id="${id}"]`)!;
const targets = (c: HTMLElement) =>
  [...c.querySelectorAll<HTMLButtonElement>('button[data-target-flight]')].map((b) =>
    Number(b.dataset.targetFlight),
  );

/** Type C (#2289): a selection gives the right targets, Esc lets go, a target moves. */
describe('StartlistaClient', () => {
  it('velg, se målene, slipp med Esc, og flytt med et trykk på et mål', async () => {
    const { container } = render(
      <StartlistaClient gameId="g" players={PLAYERS} focus={null} headingId="h" />,
    );

    // Per (flight 2, not full): his own flight and the full flight 1 are no targets.
    fireEvent.click(chip(container, 'p'));
    expect(chip(container, 'p')).toHaveAttribute('aria-pressed', 'true');
    expect(targets(container)).toEqual([3]);
    expect(screen.getByRole('status').textContent).not.toBe('');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(chip(container, 'p')).toHaveAttribute('aria-pressed', 'false');
    expect(targets(container)).toEqual([]);

    // Marte (full flight 1): flight 2 and the empty extra flight 3 are targets.
    fireEvent.click(chip(container, 'm'));
    expect(targets(container)).toEqual([2, 3]);
    await act(async () => {
      fireEvent.click(container.querySelector('button[data-target-flight="2"]')!);
    });
    expect(setPlayerFlightMock).toHaveBeenCalledWith('g', 'm', 2);
  });
});
