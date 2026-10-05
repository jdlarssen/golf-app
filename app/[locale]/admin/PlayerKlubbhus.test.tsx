import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import {
  GreetingView,
  NewRoundCard,
  ClubsView,
  CupsView,
  ToolsView,
  type RoomClub,
  type RoomCup,
} from './PlayerKlubbhusViews';

// Type C render test for the player's Klubbhus room (#892, redrawn in #2493):
// the one door for a new round, the clubs with numbers, the cups with
// progress, the tools as plain rows, and an error box per failed read
// (#2490). Asserts on data-testid/role/href only, never on Norwegian copy.
// The numbers themselves are Type A (`lib/clubs/getNextClubRounds.test.ts`,
// `lib/cup/getRoomCups.test.ts`, `lib/cup/cupRoomRows.test.ts`); «Rundene
// dine» is `ArrangedRoundsView`'s.

const CLUBS: RoomClub[] = [
  { id: 'club-1', name: 'Oslo Golfklubb', short_id: 'OGK', role: 'admin', members: 142, nextRoundAt: '2026-10-10T07:00:00Z' },
  { id: 'club-2', name: 'Bærum GK', short_id: 'BGK', role: 'member', members: 18, nextRoundAt: null },
];

const CUPS: RoomCup[] = [
  { id: 'cup-1', name: 'Klubbmesterskapet', href: '/cup/cup-1', playing: true, progress: { played: 3, total: 8 } },
  { id: 'cup-2', name: 'Ryder på hjemmebane', href: '/admin/cup/cup-2', playing: false, progress: null },
];

describe('PlayerKlubbhus room (#2493)', () => {
  it('greets with one heading: no label card, no subtitle', () => {
    const { container } = render(<GreetingView name="Kari" />);
    expect(screen.getAllByRole('heading')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(container.querySelectorAll('p')).toHaveLength(0);
  });

  it.each([
    [true, ['new-round-friends', '/opprett-spill?intent=kompis'], ['new-round-club', '/opprett-spill?intent=klubb'], 'new-round-other'],
    [false, ['new-round-friends', '/opprett-spill?intent=kompis'], ['new-round-other', '/opprett-spill'], 'new-round-club'],
  ] as const)('the one door for a new round, club admin=%s', (isClubAdmin, first, second, absent) => {
    render(<NewRoundCard isClubAdmin={isClubAdmin} />);
    const card = screen.getByTestId('new-round-card');
    expect(within(card).getAllByRole('link')).toHaveLength(2);
    expect(within(card).getByTestId(first[0])).toHaveAttribute('href', first[1]);
    expect(within(card).getByTestId(second[0])).toHaveAttribute('href', second[1]);
    expect(within(card).queryByTestId(absent)).toBeNull();
  });

  it('clubs: a row per club to its page; no clubs → the «no club» door; a failed read → an error box', () => {
    const rows = render(<ClubsView clubs={CLUBS} />);
    const links = screen.getAllByTestId('player-club-row');
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/klubber/club-1?kilde=klubbhuset',
      '/klubber/club-2?kilde=klubbhuset',
    ]);
    // The numbers ride on the row for the staging oracle (#2493 point 13).
    expect(links.map((a) => [a.dataset.role, a.dataset.members, a.dataset.nextRound])).toEqual([
      ['admin', '142', '2026-10-10T07:00:00Z'],
      ['member', '18', ''],
    ]);
    expect(screen.queryByTestId('player-no-club')).toBeNull();
    rows.unmount();

    const none = render(<ClubsView clubs={[]} />);
    expect(screen.getByTestId('player-no-club')).toHaveAttribute('href', '/klubber');
    none.unmount();

    render(<ClubsView clubs={null} />);
    expect(screen.getByTestId('klubbhus-clubs-error')).toBeInTheDocument();
    expect(screen.queryByTestId('player-no-club')).toBeNull();
  });

  it('cups: a row per running cup, playing or organising, a failed snapshot on its own row; only finished ones → one row to /admin/cup in the same style; none → nothing; a failed read → an error box', () => {
    const rows = render(<CupsView cups={CUPS} finishedCount={1} />);
    const cupRows = screen.getAllByTestId('player-cup-row');
    expect(cupRows.map((a) => a.getAttribute('href'))).toEqual(['/cup/cup-1', '/admin/cup/cup-2']);
    expect(cupRows.map((a) => [a.dataset.role, a.dataset.played, a.dataset.total, a.dataset.error])).toEqual([
      ['playing', '3', '8', undefined],
      ['organising', undefined, undefined, 'true'],
    ]);
    expect(screen.queryByTestId('klubbhus-cups-error')).toBeNull();
    rows.unmount();

    // Owner's answer 05.10 (choice 2, B): the room's row style, no trophy icon.
    const finishedOnly = render(<CupsView cups={[]} finishedCount={2} />);
    const finishedRow = screen.getByTestId('player-cup-row');
    expect(finishedRow).toHaveAttribute('href', '/admin/cup');
    expect(finishedRow.dataset.finished).toBe('2');
    expect(finishedRow.querySelector('svg')).toBeNull();
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
    finishedOnly.unmount();

    const none = render(<CupsView cups={[]} finishedCount={0} />);
    expect(none.container).toBeEmptyDOMElement();
    none.unmount();

    render(<CupsView cups={null} finishedCount={0} />);
    expect(screen.getByTestId('klubbhus-cups-error')).toBeInTheDocument();
  });

  it('tools: three plain rows without icons, back to the room (#2487)', () => {
    render(<ToolsView />);
    const tools = screen.getAllByTestId('player-tool-row');
    expect(tools.map((a) => a.getAttribute('href'))).toEqual([
      '/opprett-bane?kilde=klubbhuset',
      '/spillformater?kilde=klubbhuset',
      '/foreslaa-ide',
    ]);
    expect(tools.every((a) => a.querySelector('svg') === null)).toBe(true);
  });
});
