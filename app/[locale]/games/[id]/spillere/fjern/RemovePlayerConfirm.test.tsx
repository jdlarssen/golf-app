import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

/**
 * Type C render test (docs/test-discipline.md) — ONE test, structure only: the
 * confirm page before «Fjern» (audit 2026-11-20) posts the right player to the
 * remove action, keeps the way back on «Styr spillere», and says the guests
 * leave too: by name when the read answers, as the rule when it fails. The
 * action's redirect contract lives in ../actions.test.ts.
 */

let adminMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminMock,
}));
// The component only needs the reference for `<form action=…>`.
vi.mock('../actions', () => ({
  removePlayerFromGame: vi.fn(),
}));
const readBroughtGuests = vi.fn();
vi.mock('@/lib/games/broughtGuests', () => ({
  readBroughtGuests: (...args: unknown[]) => readBroughtGuests(...args),
  guestNamesOf: (guests: { name: string | null }[]) =>
    guests.flatMap((g) => (g.name ? [g.name] : [])),
}));

import { RemovePlayerConfirm } from './RemovePlayerConfirm';

const GAME = '11111111-1111-4111-8111-111111111111';
const PLAYER = '22222222-2222-4222-8222-222222222222';

describe('RemovePlayerConfirm (audit 2026-11-20)', () => {
  it.each([
    ['guests read', { ok: true, guests: [{ name: 'Per Gjest' }] }, 'remove-player-guests'],
    ['guests read failed', { ok: false }, 'remove-player-guests-unknown'],
  ] as const)('%s → %s', async (_label, guests, guestLine) => {
    adminMock = buildSupabaseMock([
      // games.maybeSingle — a scheduled round outside any cup
      { data: { id: GAME, status: 'scheduled', tournament_id: null } },
      // game_players.maybeSingle — the player is on the roster
      { data: { user_id: PLAYER, users: { name: 'Kari Nordmann', nickname: null } } },
    ]);
    readBroughtGuests.mockResolvedValue(guests);

    const { container } = render(
      await RemovePlayerConfirm({ gameId: GAME, userId: PLAYER, isAdmin: false }),
    );

    expect(screen.getByTestId(guestLine)).toBeTruthy();
    expect(screen.getByTestId('remove-player-confirm')).toBeTruthy();
    expect(screen.getByTestId('remove-player-cancel').getAttribute('href')).toBe(
      `/games/${GAME}/spillere`,
    );
    const hidden = Array.from(container.querySelectorAll('form input[type="hidden"]')).map(
      (el) => [(el as HTMLInputElement).name, (el as HTMLInputElement).value],
    );
    expect(hidden).toEqual([['user_id', PLAYER]]);
  });
});
