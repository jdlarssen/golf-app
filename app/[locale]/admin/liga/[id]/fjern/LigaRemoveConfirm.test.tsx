import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

/**
 * Type C render test (docs/test-discipline.md) — ONE test, structure only:
 * the confirm page posts the right ids to the action, and «Avbryt» stays on the
 * door the organiser came from (#2244). The redirect contract of the action
 * itself is locked in lib/league/actions.test.ts.
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

describe('LigaRemoveConfirm (#2244)', () => {
  it.each([
    ['admin', '/admin/liga/l1'],
    ['club', '/klubber/g1/liga/l1'],
  ] as const)('variant %s: posts league + player, cancel → %s', async (variant, backHref) => {
    adminMock = buildSupabaseMock([
      // leagues.maybeSingle — a club league, still running
      { data: { id: 'l1', name: 'Onsdagsligaen', status: 'active', group_id: 'g1' } },
      // league_players.maybeSingle — the player is a participant
      { data: { user_id: 'u2', users: { name: 'Kari Nordmann', nickname: null } } },
    ]);

    const { container } = render(
      await LigaRemoveConfirm({ leagueId: 'l1', userId: 'u2', variant }),
    );

    expect(screen.getByTestId('liga-remove-confirm')).toBeTruthy();
    const hidden = Object.fromEntries(
      Array.from(container.querySelectorAll('form input[type="hidden"]')).map((el) => [
        (el as HTMLInputElement).name,
        (el as HTMLInputElement).value,
      ]),
    );
    expect(hidden).toEqual({ league_id: 'l1', user_id: 'u2' });
    expect(screen.getByTestId('liga-remove-cancel').getAttribute('href')).toBe(backHref);
    expect(screen.queryByTestId('liga-remove-error')).toBeNull();
  });
});
