import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

/**
 * Unit tests for the edit-game server actions.
 *
 * Focus for fase 3 (#41): mode-lock-guarden i updateGameInternal må avvise
 * forsøk på å bytte game_mode etter at spillet har forlatt 'draft'-state.
 *
 * Query-sekvens (publish/update_scheduled):
 *   1. auth.getUser
 *   2. users.is_admin
 *   3. users.in(roster ids)              // pending-profile-gate
 *   4. games.select(status, game_mode)   // mode-lock-fetch (NY i fase 3)
 *   5. games.update                       // optimistic-lock på status
 *   6. game_players.delete
 *   7. game_players.insert
 *   8. revalidateTag + redirect
 */

const redirectMock = makeRedirectMock();
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));

const revalidateTagMock = vi.fn();
vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
}));

const notifyInvitedToGameMock = vi.fn<
  (...args: unknown[]) => Promise<void>
>(async () => undefined);
vi.mock('@/lib/notifications/notifyInvitedToGame', () => ({
  notifyInvitedToGame: (...args: unknown[]) =>
    notifyInvitedToGameMock(...args),
}));

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => supabaseMock,
}));

function lastRedirect(): string | undefined {
  return redirectMock.mock.calls.at(-1)?.[0];
}

function fd(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.set(k, v);
  return data;
}

/** Full best-ball publish-payload med 8 balanserte spillere. */
function fullBestBallFormData(
  overrides: Record<string, string> = {},
): FormData {
  const base: Record<string, string> = {
    name: 'Vinter-cup',
    course_id: 'course-1',
    tee_box_id: 'tee-1',
    hcp_allowance_pct: '100',
    scheduled_tee_off_at: '2026-06-15T09:00',
    side_tournament_enabled: 'false',
    game_mode: 'best_ball',
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

describe('updateScheduledAction — mode-lock', () => {
  it('blocks mode-bytte når spillet er scheduled (mode_locked_after_publish)', async () => {
    // Admin har publisert en best-ball-runde og prøver nå å sende en
    // stableford-payload via edit-flyten. Mode-lock-guarden må returnere
    // den eksplisitte feilen i stedet for å tillate skriving.
    const completedRoster = Array.from({ length: 8 }, (_, i) => ({
      id: `u${i}`,
      email: `u${i}@example.com`,
      profile_completed_at: '2026-01-01T00:00:00Z',
    }));

    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null }, // users.is_admin
      { data: completedRoster, error: null }, // users.in(roster) — pending gate
      // games.select(status, game_mode).single — mode-lock-fetch
      {
        data: { status: 'scheduled', game_mode: 'best_ball' },
        error: null,
      },
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { updateScheduledAction } = await import('./actions');

    // Payload har 1 spiller + game_mode='stableford'. Builderen aksepterer
    // dette (min 1 for stableford), så guarden er det som må stoppe det.
    await expect(
      updateScheduledAction(
        'game-1',
        fd({
          name: 'Switched mode',
          course_id: 'course-1',
          tee_box_id: 'tee-1',
          hcp_allowance_pct: '100',
          scheduled_tee_off_at: '2026-06-15T09:00',
          side_tournament_enabled: 'false',
          game_mode: 'stableford',
          player_0_id: 'u1',
        }),
      ),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe(
      '/admin/games/game-1/edit?error=mode_locked_after_publish',
    );

    // Sanity: ingen update / delete / insert ble dispatchet.
    const writeMethods = supabaseMock.__fromCalls.filter((c) =>
      ['update', 'insert', 'delete'].includes(c.method),
    );
    expect(writeMethods).toHaveLength(0);
  });

  it('tillater oppdatering når payload-mode matcher eksisterende game_mode', async () => {
    // Samme mode på begge sider: guarden passerer, og updaten skjer
    // som vanlig. Vi bryr oss bare om at den ikke blir avvist.
    const completedRoster = Array.from({ length: 8 }, (_, i) => ({
      id: `u${i}`,
      email: `u${i}@example.com`,
      profile_completed_at: '2026-01-01T00:00:00Z',
    }));

    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null }, // users.is_admin
      { data: completedRoster, error: null }, // users.in(roster)
      {
        data: { status: 'scheduled', game_mode: 'best_ball' },
        error: null,
      }, // games.select
      { data: { id: 'game-1' }, error: null }, // games.update
      { data: [], error: null }, // game_players.select (priorRoster snapshot)
      { data: null, error: null }, // game_players.delete
      { data: null, error: null }, // game_players.insert
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { updateScheduledAction } = await import('./actions');

    await expect(
      updateScheduledAction('game-1', fullBestBallFormData()),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe('/admin/games/game-1?status=updated');
    expect(revalidateTagMock).toHaveBeenCalledWith('game-game-1', 'max');
  });
});

describe('backfill invite-notify (#182) — edit-flyten', () => {
  it('diff-add: notify fyres kun for nye spillere, ikke for eksisterende', async () => {
    // Eksisterende roster har u0, u1, u2, u3. Edit-en sender u0-u7 — så
    // u4, u5, u6, u7 er nye og skal varsles. u0-u3 var med fra før og
    // skal IKKE få ny notifikasjon (de ble varslet ved første add).
    const completedRoster = Array.from({ length: 8 }, (_, i) => ({
      id: `u${i}`,
      email: `u${i}@example.com`,
      profile_completed_at: '2026-01-01T00:00:00Z',
    }));

    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null },
      { data: completedRoster, error: null },
      {
        data: { status: 'scheduled', game_mode: 'best_ball' },
        error: null,
      },
      { data: { id: 'game-diff' }, error: null }, // games.update
      // game_players.select (priorRoster) — u0..u3 var med fra før
      {
        data: [
          { user_id: 'u0' },
          { user_id: 'u1' },
          { user_id: 'u2' },
          { user_id: 'u3' },
        ],
        error: null,
      },
      { data: null, error: null }, // delete
      { data: null, error: null }, // insert
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { updateScheduledAction } = await import('./actions');
    await expect(
      updateScheduledAction('game-diff', fullBestBallFormData()),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(notifyInvitedToGameMock).toHaveBeenCalledTimes(4);
    const calledIds = notifyInvitedToGameMock.mock.calls.map(
      (c) => (c[0] as { recipientUserId: string }).recipientUserId,
    );
    expect(calledIds.sort()).toEqual(['u4', 'u5', 'u6', 'u7']);
  });

  it('roster uendret: ingen notify fyres', async () => {
    const completedRoster = Array.from({ length: 8 }, (_, i) => ({
      id: `u${i}`,
      email: `u${i}@example.com`,
      profile_completed_at: '2026-01-01T00:00:00Z',
    }));

    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null },
      { data: completedRoster, error: null },
      {
        data: { status: 'scheduled', game_mode: 'best_ball' },
        error: null,
      },
      { data: { id: 'game-same' }, error: null },
      // priorRoster identisk med payload
      {
        data: Array.from({ length: 8 }, (_, i) => ({ user_id: `u${i}` })),
        error: null,
      },
      { data: null, error: null },
      { data: null, error: null },
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { updateScheduledAction } = await import('./actions');
    await expect(
      updateScheduledAction('game-same', fullBestBallFormData()),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(notifyInvitedToGameMock).not.toHaveBeenCalled();
  });

  it('skipper inviter-self når admin legger seg selv til som ny spiller', async () => {
    const completedRoster = Array.from({ length: 8 }, (_, i) => ({
      id: i === 0 ? 'admin-1' : `u${i}`,
      email: i === 0 ? 'admin@tornygolf.no' : `u${i}@example.com`,
      profile_completed_at: '2026-01-01T00:00:00Z',
    }));

    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null },
      { data: completedRoster, error: null },
      {
        data: { status: 'scheduled', game_mode: 'best_ball' },
        error: null,
      },
      { data: { id: 'game-self' }, error: null },
      // priorRoster: u1..u7, admin-1 er ny i diff-en
      {
        data: Array.from({ length: 7 }, (_, i) => ({
          user_id: `u${i + 1}`,
        })),
        error: null,
      },
      { data: null, error: null },
      { data: null, error: null },
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1', email: 'admin@tornygolf.no' } },
    });

    const { updateScheduledAction } = await import('./actions');
    await expect(
      updateScheduledAction(
        'game-self',
        fullBestBallFormData({ player_0_id: 'admin-1' }),
      ),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(notifyInvitedToGameMock).not.toHaveBeenCalled();
  });
});

describe('saveDraftAction — mode-lock', () => {
  it('tillater mode-bytte når spillet fortsatt er draft', async () => {
    // Drafts er fortsatt under bygging — admin må fritt kunne veksle modus
    // før spillet publiseres. Mode-lock-guarden skal kun aktiveres når
    // status !== 'draft'.
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null }, // users.is_admin
      // Ingen roster-gate i save_draft-modusen
      { data: { status: 'draft', game_mode: 'best_ball' }, error: null }, // games.select
      { data: { id: 'draft-1' }, error: null }, // games.update
      { data: [], error: null }, // game_players.select (priorRoster snapshot)
      { data: null, error: null }, // game_players.delete
      // Ingen game_players.insert siden vi sender 0 spillere
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { saveDraftAction } = await import('./actions');

    await expect(
      saveDraftAction(
        'draft-1',
        fd({
          name: 'Switched mid-draft',
          side_tournament_enabled: 'false',
          game_mode: 'stableford',
        }),
      ),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe('/admin/games/draft-1?status=updated');
  });
});
