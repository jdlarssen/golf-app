import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import no from '@/messages/no.json';
import { ArrangedRoundsView } from './ArrangedRoundsView';
import type { ArrangedGame, ArrangedRounds } from '@/lib/games/arrangedGames';
import { arrangedGame } from '@/lib/games/__fixtures__/arrangedGame';

/**
 * Type C render test (one per component, docs/test-discipline.md): the groups
 * render from `groupArrangedRounds`' output in order, empty groups are hidden,
 * the live pill names the page it opens, and `upcomingLimit` caps «Neste».
 * Numbers, order, notes and hrefs are Type A (`lib/games/arrangedGames.test.ts`).
 */
const COUNTS = { total: 8, submitted: 5, notSubmitted: 3, pendingApproval: 1 };

function rounds(over: Partial<ArrangedRounds<ArrangedGame>> = {}): ArrangedRounds<ArrangedGame> {
  return {
    live: [{ game: arrangedGame({ id: 'live', status: 'active' }), counts: COUNTS }],
    upcoming: ['n1', 'n2', 'n3', 'n4'].map((id) => ({
      game: arrangedGame({ id, scheduled_tee_off_at: '2026-10-08T15:30:00Z' }),
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

const k = no.klubbhuset;

describe('ArrangedRoundsView', () => {
  it('shows the groups in order, each row one link with every word it shows in its name', () => {
    render(<ArrangedRoundsView rounds={rounds()} isAdmin={false} locale="no" />);
    const root = screen.getByTestId('arranged-rounds');
    const groups = ['arranged-live', 'arranged-next', 'arranged-drafts', 'arranged-finished'];
    const order = [...root.querySelectorAll('[data-testid]')]
      .map((el) => el.getAttribute('data-testid'))
      .filter((id): id is string => groups.includes(id ?? ''));
    expect(order).toEqual(groups);

    expect(screen.getByTestId('arranged-live-row').getAttribute('aria-label')).toBe(
      [
        'Runde live',
        k.liveStatus,
        k.delivered.replace('{submitted}', '5').replace('{total}', '8'),
        k.pendingApproval.replace('{n}', '1'),
        no.game.home.managePlayersLink,
      ].join(', '),
    );
    expect(screen.getByRole('region', { name: k.groupNext })).toBeTruthy();
    // Owner's answer 05.10: the round in progress carries the LIVE badge.
    expect(screen.getByTestId('arranged-live-badge').textContent).toBe(k.liveBadge);
  });

  it.each([
    [false, no.game.home.managePlayersLink],
    [true, k.deskPill],
  ])('admin=%s: the live pill says %s', (isAdmin, pill) => {
    render(<ArrangedRoundsView rounds={rounds()} isAdmin={isAdmin} locale="no" />);
    expect(screen.getByTestId('arranged-live-pill').textContent).toBe(pill);
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
});
