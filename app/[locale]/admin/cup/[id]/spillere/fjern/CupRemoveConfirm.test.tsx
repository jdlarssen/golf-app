import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

/**
 * Type C render test (docs/test-discipline.md) — ONE test, structure only:
 * a draft cup offers the confirm form with the right ids; a started cup offers
 * no button (the server would refuse it with `not_draft`), only the way back;
 * and the way back stays on the organiser's door (#2244). The action's
 * redirect contract lives in lib/cup/planActions.test.ts.
 */

let adminMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminMock,
}));
// The component only needs the reference for `<form action=…>`.
vi.mock('@/lib/cup/planActions', () => ({
  submitRemoveCupParticipant: vi.fn(),
}));

import { CupRemoveConfirm } from './CupRemoveConfirm';

describe('CupRemoveConfirm (#2244)', () => {
  it.each([
    ['admin', 'draft', '/admin/cup/cup-1/spillere', true],
    ['club', 'active', '/klubber/g1/cup/cup-1/spillere', false],
  ] as const)(
    'variant %s, cup %s: back → %s, form visible: %s',
    async (variant, status, backHref, formVisible) => {
      adminMock = buildSupabaseMock([
        // tournaments.maybeSingle — a club cup
        { data: { id: 'cup-1', name: 'Høstcupen', status, group_id: 'g1' } },
        // tournament_participants.maybeSingle — the player is enrolled
        {
          data: {
            user_id: 'p1',
            is_captain: true,
            users: { name: 'Kari Nordmann', nickname: null },
          },
        },
      ]);

      const { container } = render(
        await CupRemoveConfirm({ tournamentId: 'cup-1', userId: 'p1', variant }),
      );

      expect(screen.getByTestId('cup-remove-cancel').getAttribute('href')).toBe(backHref);
      if (formVisible) {
        expect(screen.getByTestId('cup-remove-confirm')).toBeTruthy();
        expect(screen.queryByTestId('cup-remove-not-draft')).toBeNull();
        const hidden = Object.fromEntries(
          Array.from(container.querySelectorAll('form input[type="hidden"]')).map((el) => [
            (el as HTMLInputElement).name,
            (el as HTMLInputElement).value,
          ]),
        );
        expect(hidden).toEqual({ id: 'cup-1', user_id: 'p1' });
      } else {
        expect(screen.getByTestId('cup-remove-not-draft')).toBeTruthy();
        expect(screen.queryByTestId('cup-remove-confirm')).toBeNull();
        expect(container.querySelector('form')).toBeNull();
      }
    },
  );
});
