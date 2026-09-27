import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

/**
 * Type C render test (docs/test-discipline.md) — ONE test, structure only:
 * a draft cup offers the confirm form with the right ids; a started cup offers
 * no button (the server would refuse it with `not_draft`), only the way back
 * under a neutral locked heading;
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

const CUP = '33333333-3333-4333-8333-333333333333';
const PLAYER = '44444444-4444-4444-8444-444444444444';

describe('CupRemoveConfirm (#2244)', () => {
  it.each([
    ['admin', 'draft', `/admin/cup/${CUP}/spillere`, true],
    ['club', 'active', `/klubber/g1/cup/${CUP}/spillere`, false],
  ] as const)(
    'variant %s, cup %s: back → %s, form visible: %s',
    async (variant, status, backHref, formVisible) => {
      adminMock = buildSupabaseMock([
        // tournaments.maybeSingle — a club cup
        { data: { id: CUP, name: 'Høstcupen', status, group_id: 'g1' } },
        // tournament_participants.maybeSingle — the player is enrolled
        {
          data: {
            user_id: PLAYER,
            is_captain: true,
            users: { name: 'Kari Nordmann', nickname: null },
          },
        },
        // groups.maybeSingle — club chrome only: the club name for the kicker
        { data: { name: 'Solnedgang GK' } },
      ]);

      const { container } = render(
        await CupRemoveConfirm({ tournamentId: CUP, userId: PLAYER, variant }),
      );

      expect(screen.getByTestId('cup-remove-cancel').getAttribute('href')).toBe(backHref);
      // Club chrome names the club, as the Spillere room does; admin chrome doesn't.
      expect(screen.queryByText('Solnedgang GK') !== null).toBe(variant === 'club');
      if (formVisible) {
        expect(screen.getByTestId('cup-remove-confirm')).toBeTruthy();
        expect(screen.queryByTestId('cup-remove-not-draft')).toBeNull();
        const hidden = Object.fromEntries(
          Array.from(container.querySelectorAll('form input[type="hidden"]')).map((el) => [
            (el as HTMLInputElement).name,
            (el as HTMLInputElement).value,
          ]),
        );
        expect(hidden).toEqual({ id: CUP, user_id: PLAYER });
      } else {
        expect(screen.getByTestId('cup-remove-not-draft')).toBeTruthy();
        expect(screen.queryByTestId('cup-remove-confirm')).toBeNull();
        expect(container.querySelector('form')).toBeNull();
      }
    },
  );
});
