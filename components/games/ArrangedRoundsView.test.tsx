import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import no from '@/messages/no.json';
import { ArrangedRoundsView } from './ArrangedRoundsView';
import type { ArrangedGame, ArrangedRounds } from '@/lib/games/arrangedGames';

/**
 * Type C render test (one per component): the groups render from
 * `groupArrangedRounds`' output, empty groups are hidden, the live pill names
 * the page it opens (the desk for admin), and `upcomingLimit` caps «Neste».
 * The numbers and the order are Type A (`lib/games/arrangedGames.test.ts`).
 */
function game(id: string, over: Partial<ArrangedGame> = {}): ArrangedGame {
  return {
    id,
    name: `Runde ${id}`,
    status: 'scheduled',
    created_at: '2026-09-01T10:00:00Z',
    started_at: null,
    ended_at: null,
    scheduled_tee_off_at: '2026-10-08T15:30:00Z',
    require_peer_approval: false,
    registration_mode: 'open',
    signups_closed_at: null,
    courses: null,
    ...over,
  };
}

const COUNTS = { total: 8, submitted: 5, notSubmitted: 3, pendingApproval: 1 };

function rounds(over: Partial<ArrangedRounds<ArrangedGame>> = {}): ArrangedRounds<ArrangedGame> {
  return {
    live: [{ game: game('live', { status: 'active' }), counts: COUNTS }],
    upcoming: ['n1', 'n2', 'n3', 'n4'].map((id) => ({
      game: game(id),
      signedUp: 8,
      signups: 'open' as const,
      missingTeeOff: false,
      note: null,
    })),
    drafts: { count: 3, onlyId: null },
    finished: { count: 24 },
    ...over,
  };
}

describe('ArrangedRoundsView', () => {
  it('shows the groups in order, each row one link with the whole story in its name', () => {
    render(<ArrangedRoundsView rounds={rounds()} isAdmin={false} locale="no" />);
    const root = screen.getByTestId('arranged-rounds');
    const order = [...root.querySelectorAll('[data-testid]')]
      .map((el) => el.getAttribute('data-testid'))
      .filter((id) => ['arranged-live', 'arranged-next', 'arranged-drafts', 'arranged-finished'].includes(id!));
    expect(order).toEqual(['arranged-live', 'arranged-next', 'arranged-drafts', 'arranged-finished']);

    const live = screen.getByTestId('arranged-live-row');
    // The name holds every word the row shows, the pill included (WCAG 2.5.3).
    expect(live.getAttribute('aria-label')).toBe(
      `Runde live, i gang, 5 av 8 har levert, 1 venter på godkjenning, ${no.game.home.managePlayersLink}`,
    );
    expect(screen.getAllByTestId('arranged-next-row')).toHaveLength(4);
    expect(screen.getByRole('region', { name: no.klubbhuset.groupNext })).toBeTruthy();
  });

  it.each([
    [false, no.game.home.managePlayersLink, '/games/live/spillere'],
    [true, no.klubbhuset.deskPill, '/admin/games/live'],
  ])('admin=%s: the live pill says %s and opens %s', (isAdmin, pill, href) => {
    render(<ArrangedRoundsView rounds={rounds()} isAdmin={isAdmin} locale="no" />);
    expect(screen.getByTestId('arranged-live-pill').textContent).toBe(pill);
    expect(screen.getByTestId('arranged-live-row').getAttribute('href')).toBe(href);
  });

  it('hides empty groups and the rows with nothing to count', () => {
    render(
      <ArrangedRoundsView
        rounds={rounds({ live: [], drafts: { count: 0, onlyId: null }, finished: { count: 0 } })}
        isAdmin={false}
        locale="no"
      />,
    );
    expect(screen.queryByTestId('arranged-live')).toBeNull();
    expect(screen.queryByTestId('arranged-drafts')).toBeNull();
    expect(screen.queryByTestId('arranged-finished')).toBeNull();
    expect(screen.getByTestId('arranged-next')).toBeTruthy();
  });

  it('caps «Neste» at upcomingLimit', () => {
    render(<ArrangedRoundsView rounds={rounds()} isAdmin={false} locale="no" upcomingLimit={3} />);
    const next = screen.getByTestId('arranged-next');
    expect(within(next).getAllByTestId('arranged-next-row')).toHaveLength(3);
  });

  it('sends an admin counting their own rounds to their own lists (#2269 O6)', () => {
    render(<ArrangedRoundsView rounds={rounds()} isAdmin locale="no" />);
    expect(screen.getByTestId('arranged-drafts').getAttribute('href')).toBe('/klubbhuset?vis=utkast');
    expect(screen.getByTestId('arranged-finished').getAttribute('href')).toBe('/klubbhuset?vis=ferdige');
    expect(screen.getByTestId('arranged-live-row').getAttribute('href')).toBe('/admin/games/live');
  });

  it('opens a lone draft in the wizard, several in the list', () => {
    const { rerender } = render(
      <ArrangedRoundsView rounds={rounds({ drafts: { count: 1, onlyId: 'd1' } })} isAdmin={false} locale="no" />,
    );
    expect(screen.getByTestId('arranged-drafts').getAttribute('href')).toBe('/games/d1/rediger?step=5');
    rerender(<ArrangedRoundsView rounds={rounds()} isAdmin={false} locale="no" />);
    expect(screen.getByTestId('arranged-drafts').getAttribute('href')).toBe('/klubbhuset?vis=utkast');
  });

  it('puts the reason line on a round that will not start by itself', () => {
    render(
      <ArrangedRoundsView
        rounds={rounds({
          live: [],
          upcoming: [
            {
              game: game('no-time', { scheduled_tee_off_at: null }),
              signedUp: 0,
              signups: null,
              missingTeeOff: true,
              note: { kind: 'missingTeeOff' },
            },
            {
              game: game('blocked'),
              signedUp: 4,
              signups: null,
              missingTeeOff: false,
              note: { kind: 'blocked', reason: 'unassigned_flights' },
            },
          ],
        })}
        isAdmin={false}
        locale="no"
      />,
    );
    const [noTime, blocked] = screen.getAllByTestId('arranged-next-row');
    expect(noTime.textContent).toContain(
      `${no.klubbhuset.missingTeeOff} · ${no.klubbhuset.notStartingBySelf}`,
    );
    const reason = no.inbox.blockReasons.unassigned_flights;
    expect(blocked.textContent).toContain(
      `${reason.charAt(0).toUpperCase()}${reason.slice(1)} · ${no.klubbhuset.notStartingBySelf}`,
    );
  });
});
