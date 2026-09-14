import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeLocaleRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

/**
 * Unit tests for `endGameMarkingWithdrawals` — «Avslutt likevel» with per-player
 * WD (#386), guarded against a late submission (#1986) and row-counted (#1886).
 *
 * Action query sequence for an ADMIN caller (FIFO queue order):
 *   1. auth.getUser                                  (vi.fn, mockResolvedValue)
 *   2. users.select(is_admin, email, name).eq.single (loadRole — admins skip
 *      the games.created_by read in requireAdminOrCreator)
 *   3. games.select(game_mode).eq.single             (supportsWithdrawal)
 *   4. game_players.select(user_id, submitted_at, withdrawn_at)
 *        .eq(game_id).in(user_id)                    (pre-read, awaited)
 *   5. game_players.update(...).eq.in.is.is.select   (guarded write, awaited)
 * `endGame` is mocked: its own pipeline is covered in `../actions.test.ts` and
 * `lib/games/endGameCore.test.ts`.
 */

const redirectMock = makeLocaleRedirectMock();
vi.mock('@/i18n/navigation', () => ({
  redirect: (arg: { href: string; locale?: string } | string) =>
    redirectMock(arg),
}));
// lib/admin/auth.ts still redirects via next/navigation — same spy.
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'no',
}));

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => supabaseMock,
}));

const endGameMock = vi.fn<(...args: unknown[]) => Promise<void>>(
  async () => undefined,
);
vi.mock('../actions', () => ({
  endGame: (...args: unknown[]) => endGameMock(...args),
}));

import { endGameMarkingWithdrawals } from './actions';

const GAME_ID = 'game-1';
const ROSTER_CHANGED = `/admin/games/${GAME_ID}/avslutt-likevel?error=roster_changed`;

/** Queue entries 2–3: an admin caller on a mode that supports withdrawal. */
const ADMIN_PREFIX = [
  { data: { is_admin: true, email: 'admin@example.com', name: 'Jørgen' }, error: null },
  { data: { game_mode: 'stableford' }, error: null },
];

function unsubmitted(userId: string) {
  return { user_id: userId, submitted_at: null, withdrawn_at: null };
}

function tickedForm(...userIds: string[]) {
  const form = new FormData();
  for (const id of userIds) form.append(`withdraw_${id}`, 'on');
  return form;
}

function rosterWrites() {
  return supabaseMock.__fromCalls.filter(
    (c) => c.table === 'game_players' && c.method === 'update',
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

function asAdmin(queue: Array<{ data?: unknown; error?: unknown }>) {
  supabaseMock = buildSupabaseMock([...ADMIN_PREFIX, ...queue]);
  (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { user: { id: 'admin-1', email: 'admin@example.com' } },
  });
}

describe('endGameMarkingWithdrawals', () => {
  it('withdraws the ticked players in ONE guarded, row-counted UPDATE and then ends the game', async () => {
    asAdmin([
      { data: [unsubmitted('user-a'), unsubmitted('user-b')], error: null }, // pre-read
      { data: [{ user_id: 'user-a' }, { user_id: 'user-b' }], error: null }, // update
    ]);

    await endGameMarkingWithdrawals(GAME_ID, tickedForm('user-a', 'user-b'));

    const calls = supabaseMock.__fromCalls;
    const updateIdx = calls.findIndex(
      (c) => c.table === 'game_players' && c.method === 'update',
    );
    expect(updateIdx).toBeGreaterThanOrEqual(0);
    expect(calls[updateIdx].args).toEqual([
      { withdrawn_at: expect.any(String), withdrawn_by_user_id: 'admin-1' },
    ]);
    // The guard IS the filter chain: only still-unsubmitted, not-yet-withdrawn
    // rows may be hit, and `.select` is what lets the action count them.
    expect(calls.slice(updateIdx + 1, updateIdx + 6)).toEqual([
      { table: 'game_players', method: 'eq', args: ['game_id', GAME_ID] },
      { table: 'game_players', method: 'in', args: ['user_id', ['user-a', 'user-b']] },
      { table: 'game_players', method: 'is', args: ['submitted_at', null] },
      { table: 'game_players', method: 'is', args: ['withdrawn_at', null] },
      { table: 'game_players', method: 'select', args: ['user_id'] },
    ]);
    expect(rosterWrites()).toHaveLength(1);
    expect(endGameMock).toHaveBeenCalledWith(GAME_ID, true);
  });

  it('a ticked player who submitted in the meantime stops everything: no write, no finish', async () => {
    asAdmin([
      {
        data: [
          unsubmitted('user-a'),
          { user_id: 'user-b', submitted_at: '2026-09-14T10:00:00Z', withdrawn_at: null },
        ],
        error: null,
      }, // pre-read
    ]);

    await expect(
      endGameMarkingWithdrawals(GAME_ID, tickedForm('user-a', 'user-b')),
    ).rejects.toMatchObject({ url: ROSTER_CHANGED });

    expect(rosterWrites()).toEqual([]);
    expect(endGameMock).not.toHaveBeenCalled();
  });

  it.each([
    ['fewer rows than ticked', [{ user_id: 'user-a' }]],
    ['0 rows (NoRowsAffectedError)', []],
  ])(
    'an UPDATE that hits %s sends the organiser back to the confirm page without finishing',
    async (_label, updatedRows) => {
      asAdmin([
        { data: [unsubmitted('user-a'), unsubmitted('user-b')], error: null }, // pre-read
        { data: updatedRows, error: null }, // update lost the race
      ]);

      const run = endGameMarkingWithdrawals(GAME_ID, tickedForm('user-a', 'user-b'));

      await expect(run).rejects.toBeInstanceOf(RedirectError);
      await expect(run).rejects.toMatchObject({ url: ROSTER_CHANGED });
      expect(endGameMock).not.toHaveBeenCalled();
    },
  );
});
