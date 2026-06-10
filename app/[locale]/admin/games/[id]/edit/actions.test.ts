import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

/**
 * Unit tests for the edit-game server actions.
 *
 * Mode-lock (#41): updateGameInternal must reject game_mode changes once the
 * game has left 'draft'. #428: the actions are now gated on
 * requireAdminOrCreator — admins keep their Sekretariat redirects, a game's
 * creator gets /games/[id]/rediger + /games/[id]; the pending-profile gate
 * runs through the incomplete_profiles_for_ids RPC (not a direct users-read)
 * so it bites for a non-admin creator under request-scoped RLS.
 *
 * Query-sekvens (publish/update_scheduled):
 *   1. auth.getUser                        // loadRole
 *   2. users.select(is_admin,email,name)   // loadRole
 *   3. games.select(created_by)            // requireAdminOrCreator — ONLY when not admin
 *   4. rpc(incomplete_profiles_for_ids)    // pending gate (keyed, not in FIFO queue)
 *   5. games.select(status, game_mode)     // mode-lock fetch
 *   6. games.update                        // optimistic-lock på status
 *   7. game_players.select                 // priorRoster snapshot
 *   8. game_players.delete
 *   9. game_players.insert
 *  10. revalidateTag + redirect
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

/** Stub `auth.getUser` to return a signed-in user with the given id. */
function signIn(id: string, email?: string) {
  (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { user: { id, ...(email ? { email } : {}) } },
  });
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
    supabaseMock = buildSupabaseMock(
      [
        { data: { is_admin: true }, error: null }, // loadRole: users.select
        // games.select(status, game_mode).single — mode-lock-fetch
        {
          data: { status: 'scheduled', game_mode: 'best_ball' },
          error: null,
        },
      ],
      { incomplete_profiles_for_ids: [] }, // pending gate clears
    );
    signIn('admin-1');

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
    supabaseMock = buildSupabaseMock(
      [
        { data: { is_admin: true }, error: null }, // loadRole
        {
          data: { status: 'scheduled', game_mode: 'best_ball' },
          error: null,
        }, // games.select
        { data: { id: 'game-1' }, error: null }, // games.update
        { data: [], error: null }, // game_players.select (priorRoster snapshot)
        { data: null, error: null }, // game_players.delete
        { data: null, error: null }, // game_players.insert
      ],
      { incomplete_profiles_for_ids: [] },
    );
    signIn('admin-1');

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
    supabaseMock = buildSupabaseMock(
      [
        { data: { is_admin: true }, error: null }, // loadRole
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
      ],
      { incomplete_profiles_for_ids: [] },
    );
    signIn('admin-1');

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
    supabaseMock = buildSupabaseMock(
      [
        { data: { is_admin: true }, error: null }, // loadRole
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
      ],
      { incomplete_profiles_for_ids: [] },
    );
    signIn('admin-1');

    const { updateScheduledAction } = await import('./actions');
    await expect(
      updateScheduledAction('game-same', fullBestBallFormData()),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(notifyInvitedToGameMock).not.toHaveBeenCalled();
  });

  it('skipper inviter-self når admin legger seg selv til som ny spiller', async () => {
    supabaseMock = buildSupabaseMock(
      [
        { data: { is_admin: true }, error: null }, // loadRole
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
      ],
      { incomplete_profiles_for_ids: [] },
    );
    signIn('admin-1', 'admin@tornygolf.no');

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
    // status !== 'draft'. save_draft kjører ingen pending-gate (ingen RPC).
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null }, // loadRole
      { data: { status: 'draft', game_mode: 'best_ball' }, error: null }, // games.select
      { data: { id: 'draft-1' }, error: null }, // games.update
      { data: [], error: null }, // game_players.select (priorRoster snapshot)
      { data: null, error: null }, // game_players.delete
      // Ingen game_players.insert siden vi sender 0 spillere
    ]);
    signIn('admin-1');

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

describe('requireAdminOrCreator gate (#428) — creator-flaten', () => {
  it('oppretter (ikke-admin, eier spillet) lander på /games/[id] etter update_scheduled', async () => {
    // loadRole gir is_admin:false → requireAdminOrCreator leser games.created_by
    // og matcher userId. Writes går på request-scoped klient (creator-RLS 0071),
    // og redirect-basen forgrenes til /games/* i stedet for /admin/games/*.
    supabaseMock = buildSupabaseMock(
      [
        { data: { is_admin: false }, error: null }, // loadRole: not admin
        { data: { created_by: 'creator-1' }, error: null }, // gate owner-check ✓
        {
          data: { status: 'scheduled', game_mode: 'best_ball' },
          error: null,
        }, // mode-lock
        { data: { id: 'game-1' }, error: null }, // games.update
        { data: [], error: null }, // priorRoster
        { data: null, error: null }, // delete
        { data: null, error: null }, // insert
      ],
      { incomplete_profiles_for_ids: [] },
    );
    signIn('creator-1');

    const { updateScheduledAction } = await import('./actions');
    await expect(
      updateScheduledAction('game-1', fullBestBallFormData()),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe('/games/game-1?status=updated');
    expect(revalidateTagMock).toHaveBeenCalledWith('game-game-1', 'max');
  });

  it('oppretter publish med pending-spiller bouncer til /games/[id]/rediger (ikke /admin/*)', async () => {
    // RPC-en returnerer en ufullstendig profil → gaten må bite for oppretteren,
    // og bouncen går til den ikke-admin rediger-flaten.
    supabaseMock = buildSupabaseMock(
      [
        { data: { is_admin: false }, error: null }, // loadRole
        { data: { created_by: 'creator-1' }, error: null }, // gate owner-check ✓
      ],
      {
        incomplete_profiles_for_ids: [
          { id: 'u1', email: 'u1@example.com' },
        ],
      },
    );
    signIn('creator-1');

    const { publishFromDraftAction } = await import('./actions');
    await expect(
      publishFromDraftAction('game-1', fullBestBallFormData()),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toContain(
      '/games/game-1/rediger?error=pending_players',
    );
    // Ingen skriv skjedde (blokkert før mode-lock + update).
    const writeMethods = supabaseMock.__fromCalls.filter((c) =>
      ['update', 'insert', 'delete'].includes(c.method),
    );
    expect(writeMethods).toHaveLength(0);
  });

  it('ikke-eier ikke-admin → redirect /', async () => {
    // requireAdminOrCreator: loadRole gir is_admin:false, og games.created_by
    // matcher ikke userId → redirect('/'). Ingen skriv.
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: false }, error: null }, // loadRole
      { data: { created_by: 'someone-else' }, error: null }, // gate owner-check ✗
    ]);
    signIn('creator-1');

    const { updateScheduledAction } = await import('./actions');
    await expect(
      updateScheduledAction('game-1', fullBestBallFormData()),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe('/');
    const writeMethods = supabaseMock.__fromCalls.filter((c) =>
      ['update', 'insert', 'delete'].includes(c.method),
    );
    expect(writeMethods).toHaveLength(0);
  });
});
