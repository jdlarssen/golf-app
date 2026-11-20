import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { StartlistaClient, type StartlistaPlayer } from './StartlistaClient';

const { setPlayerFlightMock, setTeeIntervalMock } = vi.hoisted(() => ({
  setPlayerFlightMock: vi.fn(),
  setTeeIntervalMock: vi.fn(),
}));
vi.mock('../flightActions', () => ({
  setPlayerFlight: (...args: unknown[]) => setPlayerFlightMock(...args),
  setTeeInterval: (...args: unknown[]) => setTeeIntervalMock(...args),
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

    // #2451: with start times each card has its time in front of the title,
    // the interval choice sits over the cards, and a tap on another choice
    // goes to the server. A round from before #2451 has no choice pressed.
    const startTimes = {
      gameMode: 'solo_strokeplay' as const,
      teamSize: 1,
      teeOffAt: '2026-11-21T08:00:00.000Z',
      interval: 12,
    };
    const { rerender } = render(
      <StartlistaClient gameId="g" players={PLAYERS} focus={null} headingId="h2" startTimes={startTimes} />,
    );
    const timed = screen.getAllByTestId('tee-interval');
    expect(timed).toHaveLength(1);
    expect(screen.getAllByRole('heading', { name: /^\d\d:\d\d Flight \d$/ }).length).toBeGreaterThan(1);
    expect(screen.getByTestId('tee-interval-12')).toHaveAttribute('aria-pressed', 'true');
    await act(async () => {
      fireEvent.click(screen.getByTestId('tee-interval-10'));
    });
    expect(setTeeIntervalMock).toHaveBeenCalledWith('g', 10);

    rerender(
      <StartlistaClient
        gameId="g"
        players={PLAYERS}
        focus={null}
        headingId="h2"
        startTimes={{ ...startTimes, interval: null }}
      />,
    );
    expect(screen.queryAllByRole('heading', { name: /^\d\d:\d\d Flight \d$/ })).toHaveLength(0);
    for (const m of [8, 10, 12]) {
      expect(screen.getByTestId(`tee-interval-${m}`)).toHaveAttribute('aria-pressed', 'false');
    }
  });
});
