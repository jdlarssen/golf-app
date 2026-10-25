import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { GameForm, type CourseOption, type InitialValues, type PlayerOption } from './GameForm';
import type { EditNav } from './EditOverview';

// «Rediger spill» for a scheduled game (#2322): the overview is GameForm's
// `view="overview"`, so it reads the same form state the parts save.

const FUTURE_TEE_OFF = (() => {
  const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
})();

const COURSES: CourseOption[] = [
  {
    id: 'course-1',
    name: 'Byneset North',
    tee_boxes: [{ id: 'tee-1', name: 'Gul', has_mens: true, has_ladies: true, has_juniors: false }],
  },
];

const PLAYERS: PlayerOption[] = Array.from({ length: 12 }, (_, i) => ({
  id: `u${i}`,
  name: `Spiller ${i + 1}`,
  nickname: null,
  hcp_index: 18,
  pending: false,
  gender: null,
  level: 'normal',
}));

// Twelve players, ten in three flights and two without one.
const INITIAL: InitialValues = {
  name: 'Lørdagsrunden',
  course_id: 'course-1',
  tee_box_id: 'tee-1',
  scheduled_tee_off_at: FUTURE_TEE_OFF,
  game_mode: 'stableford',
  team_size: 1,
  lock_game_mode: true,
  hcp_allowance_pct: '85',
  players: PLAYERS.map((p, i) => ({
    user_id: p.id,
    team_number: null,
    flight_number: i < 10 ? Math.floor(i / 4) + 1 : null,
  })),
};

const NAV: EditNav = {
  baseHref: '/games/game-1/rediger',
  deleteHref: '/games/game-1/slett',
  startlistHref: '/admin/games/game-1/startlista',
  startBlock: null,
  flightCount: 3,
  title: 'Lørdagsrunden',
  statusLabel: 'Planlagt',
};

function renderOverview(editNav: EditNav) {
  return render(
    <GameForm
      courses={COURSES}
      players={PLAYERS}
      initialValues={INITIAL}
      mode={{ kind: 'edit-scheduled', gameId: 'game-1', updateAction: async () => {} }}
      view="overview"
      editNav={editNav}
    />,
  );
}

describe('EditOverview (#2322)', () => {
  it('lists six parts, each with «Endre» to ?del=, and no form', () => {
    const { container } = renderOverview(NAV);
    expect(container.querySelector('form')).toBeNull();
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(6);
    const hrefs = items.map((li) => within(li).getByRole('link').getAttribute('href'));
    for (const part of ['navn-og-tid', 'bane', 'format', 'spillere', 'pamelding', 'innstillinger']) {
      expect(hrefs.some((h) => h?.endsWith(`/games/game-1/rediger?del=${part}`))).toBe(true);
    }
    expect(screen.getByRole('link', { name: 'Endre bane' })).toBeInTheDocument();

    expect(screen.getByRole('heading', { level: 1, name: 'Lørdagsrunden' })).toBeInTheDocument();
    expect(screen.getByTestId('edit-row-bane')).toHaveTextContent('Byneset North · Tee: Gul');
    expect(screen.getByTestId('edit-row-format')).toHaveTextContent('85 % handicap');
    expect(screen.getByTestId('edit-row-spillere')).toHaveTextContent('12 spillere · 3 flighter');
    expect(screen.getByTestId('edit-row-bane')).toHaveAttribute('data-status', 'ok');
    expect(screen.getByTestId('edit-overview-autostart')).toHaveTextContent(/^Starter av seg selv /);
    expect(screen.getByTestId('edit-overview-delete')).toHaveAttribute(
      'href',
      expect.stringContaining('/games/game-1/slett'),
    );
    // No start action, no start button.
    expect(screen.queryByTestId('start-scheduled-game')).toBeNull();
  });

  it('players without a flight: the amber line and the Startlista link on Spillere, and no autostart', () => {
    renderOverview({
      ...NAV,
      startBlock: { reason: 'unassigned_flights', message: null, unassignedCount: 2 },
      start: { action: async () => {}, label: 'Start runden nå', confirmText: 'Sikker?' },
    });
    const row = screen.getByTestId('edit-row-spillere');
    expect(within(row).getByText('2 uten flight')).toHaveClass('text-warning-text');
    expect(within(row).getByTestId('edit-overview-startlist-link')).toHaveAttribute(
      'href',
      expect.stringContaining('/admin/games/game-1/startlista'),
    );
    expect(screen.queryByTestId('edit-overview-autostart')).toBeNull();
    expect(screen.getByTestId('start-scheduled-game')).toHaveTextContent('Start runden nå →');
  });

  it('another reason to stop the start sits on the row it belongs to', () => {
    renderOverview({
      ...NAV,
      startBlock: { reason: 'tee_missing_rating', message: 'Teen mangler rating.', unassignedCount: 0 },
    });
    expect(within(screen.getByTestId('edit-row-bane')).getByText('Teen mangler rating.')).toBeInTheDocument();
    expect(within(screen.getByTestId('edit-row-spillere')).queryByText('Teen mangler rating.')).toBeNull();
  });
});
