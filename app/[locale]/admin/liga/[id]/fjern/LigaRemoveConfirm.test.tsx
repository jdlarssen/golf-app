import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

/**
 * Type C render test (docs/test-discipline.md) — ONE test, structure only:
 * the confirm page posts the right ids to the action, «Avbryt» stays on the
 * door the organiser came from, and a finished league (its table is the season
 * record) offers no button, only the way back (#2244). The action's redirect
 * contract is locked in lib/league/actions.test.ts.
 */

let adminMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminMock,
}));
// The component only needs the reference for `<form action=…>`.
vi.mock('@/lib/league/actions', () => ({
  removeLeaguePlayer: vi.fn(),
}));

import { LigaRemoveConfirm } from './LigaRemoveConfirm';

const LEAGUE = '11111111-1111-4111-8111-111111111111';
const PLAYER = '22222222-2222-4222-8222-222222222222';

describe('LigaRemoveConfirm (#2244)', () => {
  it.each([
    ['admin', 'active', `/admin/liga/${LEAGUE}`, true],
    ['club', 'active', `/klubber/g1/liga/${LEAGUE}`, true],
    ['club', 'finished', `/klubber/g1/liga/${LEAGUE}`, false],
  ] as const)(
    'variant %s, league %s: back → %s, form visible: %s',
    async (variant, status, backHref, formVisible) => {
      adminMock = buildSupabaseMock([
        // leagues.maybeSingle — a club league
        { data: { id: LEAGUE, name: 'Onsdagsligaen', status, group_id: 'g1' } },
        // league_players.maybeSingle — the player is a participant
        { data: { user_id: PLAYER, users: { name: 'Kari Nordmann', nickname: null } } },
        // groups.maybeSingle — the club name for the TopBar kicker
        { data: { name: 'Solnedgang GK' } },
      ]);

      const { container } = render(
        await LigaRemoveConfirm({ leagueId: LEAGUE, userId: PLAYER, variant }),
      );

      expect(screen.getByTestId('liga-remove-cancel').getAttribute('href')).toBe(backHref);
      expect(screen.getByText('Solnedgang GK')).toBeTruthy();
      expect(screen.queryByTestId('liga-remove-error')).toBeNull();
      if (formVisible) {
        expect(screen.getByTestId('liga-remove-confirm')).toBeTruthy();
        expect(screen.queryByTestId('liga-remove-finished')).toBeNull();
        const hidden = Object.fromEntries(
          Array.from(container.querySelectorAll('form input[type="hidden"]')).map((el) => [
            (el as HTMLInputElement).name,
            (el as HTMLInputElement).value,
          ]),
        );
        expect(hidden).toEqual({ league_id: LEAGUE, user_id: PLAYER });
      } else {
        expect(screen.getByTestId('liga-remove-finished')).toBeTruthy();
        expect(screen.queryByTestId('liga-remove-confirm')).toBeNull();
        expect(container.querySelector('form')).toBeNull();
      }
    },
  );
});
