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
 *   3. games.select(game_mode, status).eq.single     (supportsWithdrawal; a
 *      read error fails closed → db_players; a game that is no longer active
 *      → not_active before any roster I/O, #2031)
 *   4. game_players.select(user_id, submitted_at, withdrawn_at)
 *        .eq(game_id).in(user_id)                    (pre-read, awaited; a
 *      missing, submitted or withdrawn ticked row → roster_changed)
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

// A partial withdrawal commits rows without ever reaching endGame, so the
// action revalidates the game tag itself.
const revalidateTagMock = vi.fn();
vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
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

const GAME_ID = 'game-1';
const ROSTER_CHANGED = `/admin/games/${GAME_ID}/avslutt-likevel?error=roster_changed`;

/** Queue entry 2: an admin caller. */
const ADMIN_ROW = {
  data: { is_admin: true, email: 'admin@example.com', name: 'Jørgen' },
  error: null,
};
/** Queue entry 3 by default: a game in play, on a mode that supports withdrawal. */
const ACTIVE_GAME = { game_mode: 'stableford', status: 'active' };

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

/**
 * Queue an admin caller, then import the action. Dynamic import is the repo
 * convention for server actions (tests/serverActionMocks.ts) so the `vi.mock`
 * hoist applies before the module graph loads.
 */
async function asAdmin(
  queue: Array<{ data?: unknown; error?: unknown }>,
  game: { game_mode: string; status: string } = ACTIVE_GAME,
) {
  supabaseMock = buildSupabaseMock([
    ADMIN_ROW,
    { data: game, error: null },
    ...queue,
  ]);
  (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { user: { id: 'admin-1', email: 'admin@example.com' } },
  });
  const { endGameMarkingWithdrawals } = await import('./actions');
  return endGameMarkingWithdrawals;
}

describe('endGameMarkingWithdrawals', () => {
  it('withdraws the ticked players in ONE guarded, row-counted UPDATE and then ends the game', async () => {
    const endGameMarkingWithdrawals = await asAdmin([
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

  it.each(['finished', 'scheduled', 'draft'])(
    'a stale tab on a %s game goes to the detail page with not_active: no roster read, no write, no finish',
    async (status) => {
      // Ticked players, so without the status gate the write path is reached.
      const endGameMarkingWithdrawals = await asAdmin(
        [
          { data: [unsubmitted('user-a'), unsubmitted('user-b')], error: null }, // pre-read
          { data: [{ user_id: 'user-a' }, { user_id: 'user-b' }], error: null }, // update
        ],
        { game_mode: 'stableford', status },
      );

      await expect(
        endGameMarkingWithdrawals(GAME_ID, tickedForm('user-a', 'user-b')),
      ).rejects.toMatchObject({ url: `/admin/games/${GAME_ID}?error=not_active` });

      expect(
        supabaseMock.__fromCalls.filter((c) => c.table === 'game_players'),
      ).toEqual([]);
      expect(endGameMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      'a ticked player submitted in the meantime',
      [
        unsubmitted('user-a'),
        { user_id: 'user-b', submitted_at: '2026-09-14T10:00:00Z', withdrawn_at: null },
      ],
    ],
    [
      'a ticked player is already withdrawn',
      [
        unsubmitted('user-a'),
        { user_id: 'user-b', submitted_at: null, withdrawn_at: '2026-09-14T10:00:00Z' },
      ],
    ],
    ['a ticked player is missing from the roster', [unsubmitted('user-a')]],
  ])(
    'the pre-read stops everything when %s: no write, no finish',
    async (_label, preReadRows) => {
      const endGameMarkingWithdrawals = await asAdmin([
        { data: preReadRows, error: null }, // pre-read
      ]);

      await expect(
        endGameMarkingWithdrawals(GAME_ID, tickedForm('user-a', 'user-b')),
      ).rejects.toMatchObject({ url: ROSTER_CHANGED });

      expect(rosterWrites()).toEqual([]);
      expect(endGameMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['fewer rows than ticked', [{ user_id: 'user-a' }], [[`game-${GAME_ID}`, { expire: 0 }]]],
    ['0 rows (NoRowsAffectedError)', [], []],
  ])(
    'an UPDATE that hits %s sends the organiser back to the confirm page without finishing',
    async (_label, updatedRows, expectedRevalidations) => {
      const endGameMarkingWithdrawals = await asAdmin([
        { data: [unsubmitted('user-a'), unsubmitted('user-b')], error: null }, // pre-read
        { data: updatedRows, error: null }, // update lost the race
      ]);

      const run = endGameMarkingWithdrawals(GAME_ID, tickedForm('user-a', 'user-b'));

      await expect(run).rejects.toBeInstanceOf(RedirectError);
      await expect(run).rejects.toMatchObject({ url: ROSTER_CHANGED });
      expect(endGameMock).not.toHaveBeenCalled();
      // Rows that did commit skip endGame's revalidation, so the action must
      // refresh the cached game itself; a write that hit nothing has nothing
      // to refresh.
      expect(revalidateTagMock.mock.calls).toEqual(expectedRevalidations);
    },
  );
});
