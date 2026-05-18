import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

/**
 * Unit tests for the "create game" server actions.
 *
 * The module exports two entry points (`createGameDraft`, `createAndPublishGame`)
 * that both delegate to a private `createGameInternal(formData, mode)`. The
 * mode determines whether the full validation set runs (publish) or just
 * the loose draft subset.
 *
 * Sequence for the publish-mode happy path:
 *   1. buildGameInsertPayload (pure) — validates name/course/tee/team-balance
 *   2. parseOsloDateTimeLocal — required for publish
 *   3. parseSideTournamentFromFormData (pure)
 *   4. auth.getUser
 *   5. users.is_admin lookup
 *   6. (publish only) users.in(roster ids) — pending-profile gate
 *   7. games.insert(...).select('id').single
 *   8. game_players.insert(rows) — resolves
 *   9. redirect
 */

const redirectMock = makeRedirectMock();
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => supabaseMock,
}));

function lastRedirect(): string | undefined {
  return redirectMock.mock.calls.at(-1)?.[0];
}

/** Build a FormData with key/value pairs (and any duplicates via append). */
function fd(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.set(k, v);
  return data;
}

/** Build a "minimum-valid publish payload" with 8 balanced players. */
function fullPublishFormData(overrides: Record<string, string> = {}): FormData {
  const base: Record<string, string> = {
    name: 'Vinter-cup',
    course_id: 'course-1',
    tee_box_id: 'tee-1',
    hcp_allowance_pct: '100',
    scheduled_tee_off_at: '2026-06-15T09:00',
    side_tournament_enabled: 'false',
  };
  for (let i = 0; i < 8; i++) {
    base[`player_${i}_id`] = `u${i}`;
    base[`player_${i}_team`] = String(Math.floor(i / 2) + 1);
    base[`player_${i}_flight`] = String(Math.floor(i / 2) < 2 ? 1 : 2);
  }
  for (const [k, v] of Object.entries(overrides)) base[k] = v;
  return fd(base);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createGameDraft', () => {
  it('auth gate: redirects to /login when no user is authenticated', async () => {
    supabaseMock = buildSupabaseMock([]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: null },
    });

    const { createGameDraft } = await import('./actions');

    await expect(createGameDraft(fd({ name: 'Test' }))).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(redirectMock).toHaveBeenCalledWith('/login');
  });

  it('validation: redirects with ?error=name_required when name is empty', async () => {
    // No Supabase calls expected — buildGameInsertPayload short-circuits before
    // any client work. Auth is reached only after the pure-validation pass.
    supabaseMock = buildSupabaseMock([]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { createGameDraft } = await import('./actions');

    await expect(createGameDraft(fd({ name: '   ' }))).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(lastRedirect()).toBe('/admin/games/new?error=name_required');
  });

  it('happy path (draft): inserts game row + game_players, redirects with ?status=draft_created', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null }, // users.is_admin
      { data: { id: 'new-game-1' }, error: null }, // games.insert(...).select.single
      { data: null, error: null }, // game_players.insert
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { createGameDraft } = await import('./actions');

    await expect(
      createGameDraft(
        fd({
          name: 'Vinter-cup-draft',
          // Draft doesn't require course/tee/full roster — minimal payload OK.
          side_tournament_enabled: 'false',
        }),
      ),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe('/admin/games/new-game-1?status=draft_created');
  });
});

describe('createAndPublishGame', () => {
  it('validation: redirects with ?error=course_required when course is missing on publish', async () => {
    // Publish-mode requires course_id. The validation happens in
    // buildGameInsertPayload before any Supabase work, so no queue entries needed.
    supabaseMock = buildSupabaseMock([]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { createAndPublishGame } = await import('./actions');

    await expect(
      createAndPublishGame(
        fullPublishFormData({ course_id: '' }), // drop course
      ),
    ).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/admin/games/new?error=course_required');
  });

  it('edge case (publish guard): redirects with ?error=pending_players when a roster player has no completed profile', async () => {
    // The publish path runs a defensive query against `users` to ensure every
    // roster player has completed onboarding. A null `profile_completed_at`
    // blocks the publish — the action redirects before the games.insert call.
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null }, // users.is_admin
      {
        // users.in([u0..u7]) — pending-profile gate
        data: [
          {
            id: 'u0',
            email: 'u0@example.com',
            profile_completed_at: '2026-01-01T00:00:00Z',
          },
          {
            id: 'u1',
            email: 'u1@example.com',
            profile_completed_at: null, // pending
          },
          // ...other users present and completed; one pending is enough.
        ],
        error: null,
      },
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { createAndPublishGame } = await import('./actions');

    await expect(
      createAndPublishGame(fullPublishFormData()),
    ).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/admin/games/new?error=pending_players');
  });

  it('happy path (publish): inserts scheduled game, redirects with ?status=scheduled', async () => {
    // Build a roster where ALL profiles are completed.
    const completedRoster = Array.from({ length: 8 }, (_, i) => ({
      id: `u${i}`,
      email: `u${i}@example.com`,
      profile_completed_at: '2026-01-01T00:00:00Z',
    }));

    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null }, // users.is_admin
      { data: completedRoster, error: null }, // users.in(roster ids) — pending gate clears
      { data: { id: 'new-game-2' }, error: null }, // games.insert.select.single
      { data: null, error: null }, // game_players.insert
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { createAndPublishGame } = await import('./actions');

    await expect(
      createAndPublishGame(fullPublishFormData()),
    ).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/admin/games/new-game-2?status=scheduled');
  });
});
