import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeLocaleRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

/**
 * Tests for `addExistingPlayerToGame` + `inviteEmailToGame` server-actions.
 *
 * Key invariants:
 *  - Authz via requireAdminOrCreator (admin OR the game's creator — #429).
 *    Admin redirects land on /admin/games/[id]; creator on /games/[id]/spillere.
 *  - Disposable-domener blokkeres for ikke-admin-arrangør, ikke for admin (#422).
 *  - Status gate: only draft/scheduled allow add/invite.
 *  - Capacity gate: best_ball refuses at 8 players.
 *  - Idempotency: duplicate (game_id, user_id) swallow-es; duplicate pending
 *    invitation for samme spill swallow-es.
 *  - notify fires after game_players insert; never blocks the action.
 *  - inviter-self: no notify.
 */

const redirectMock = makeLocaleRedirectMock();
vi.mock('@/i18n/navigation', () => ({
  redirect: (arg: { href: string; locale?: string } | string) =>
    redirectMock(arg),
}));
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'no',
}));

const revalidateTagMock = vi.fn();
vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
}));

const notifyInvitedToGameMock =
  vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined);
vi.mock('@/lib/notifications/notifyInvitedToGame', () => ({
  notifyInvitedToGame: (...args: unknown[]) =>
    notifyInvitedToGameMock(...args),
}));

const sendInviteNotificationMock =
  vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined);
vi.mock('@/lib/mail/inviteNotification', () => ({
  sendInviteNotification: (...args: unknown[]) =>
    sendInviteNotificationMock(...args),
}));

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => supabaseMock,
}));

const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const RECIPIENT_ID = '22222222-2222-2222-2222-222222222222';
const GAME_ID = '33333333-3333-3333-3333-333333333333';
const CREATOR_ID = '44444444-4444-4444-4444-444444444444';

function authedAsAdmin(): void {
  (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { user: { id: ADMIN_ID, email: 'admin@tornygolf.no' } },
  });
}

function authedAsCreator(): void {
  (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { user: { id: CREATOR_ID, email: 'arrangor@example.com' } },
  });
}

// loadRole users-read for a non-admin user, then requireAdminOrCreator's
// games.created_by lookup confirming ownership.
const CREATOR_ROLE_READ = {
  data: { is_admin: false, email: 'arrangor@example.com', name: 'Kari' },
  error: null,
} as const;
const CREATOR_OWNS_GAME = { data: { created_by: CREATOR_ID }, error: null } as const;

function lastRedirect(): string | undefined {
  const arg = redirectMock.mock.calls.at(-1)?.[0];
  if (!arg) return undefined;
  return typeof arg === 'string' ? arg : arg.href;
}

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('addExistingPlayerToGame', () => {
  it('insertes spiller + fyrer notify når draft-spill har plass', async () => {
    supabaseMock = buildSupabaseMock([
      // requireAdmin: users.select.eq.single
      { data: { is_admin: true, email: 'admin@tornygolf.no', name: 'Jørgen' }, error: null },
      // loadGameForInvite: games.select.eq.single
      {
        data: { id: GAME_ID, name: 'Vinter-cup', status: 'draft', game_mode: 'best_ball' },
        error: null,
      },
      // capacity-check: game_players.select.eq (count=3)
      { data: [], error: null, count: 3 } as never,
      // game_players insert
      { data: null, error: null },
    ]);
    authedAsAdmin();

    const { addExistingPlayerToGame } = await import('./inviteToGameActions');

    await expect(
      addExistingPlayerToGame(GAME_ID, formData({ recipient_user_id: RECIPIENT_ID })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(notifyInvitedToGameMock).toHaveBeenCalledTimes(1);
    expect(notifyInvitedToGameMock).toHaveBeenCalledWith({
      recipientUserId: RECIPIENT_ID,
      gameId: GAME_ID,
      inviterUserId: ADMIN_ID,
    });
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, 'max');
    expect(lastRedirect()).toBe(`/admin/games/${GAME_ID}?status=invite_added`);
  });

  it('avviser når spillet er active (status-lock)', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, email: 'admin@tornygolf.no', name: 'Jørgen' }, error: null },
      {
        data: { id: GAME_ID, name: 'Vinter-cup', status: 'active', game_mode: 'best_ball' },
        error: null,
      },
    ]);
    authedAsAdmin();

    const { addExistingPlayerToGame } = await import('./inviteToGameActions');
    await expect(
      addExistingPlayerToGame(GAME_ID, formData({ recipient_user_id: RECIPIENT_ID })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(notifyInvitedToGameMock).not.toHaveBeenCalled();
    expect(lastRedirect()).toBe(`/admin/games/${GAME_ID}?error=game_locked`);
  });

  it('avviser når best-ball er fullt (8/8)', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, email: 'admin@tornygolf.no', name: 'Jørgen' }, error: null },
      {
        data: { id: GAME_ID, name: 'Vinter-cup', status: 'scheduled', game_mode: 'best_ball' },
        error: null,
      },
      // capacity: 8 already
      { data: [], error: null, count: 8 } as never,
    ]);
    authedAsAdmin();

    const { addExistingPlayerToGame } = await import('./inviteToGameActions');
    await expect(
      addExistingPlayerToGame(GAME_ID, formData({ recipient_user_id: RECIPIENT_ID })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(notifyInvitedToGameMock).not.toHaveBeenCalled();
    expect(lastRedirect()).toBe(`/admin/games/${GAME_ID}?error=game_full`);
  });

  it('idempotent: UNIQUE-violation swallow-es uten ny notify', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, email: 'admin@tornygolf.no', name: 'Jørgen' }, error: null },
      {
        data: { id: GAME_ID, name: 'Vinter-cup', status: 'draft', game_mode: 'best_ball' },
        error: null,
      },
      { data: [], error: null, count: 3 } as never,
      { data: null, error: { code: '23505', message: 'duplicate key' } },
    ]);
    authedAsAdmin();

    const { addExistingPlayerToGame } = await import('./inviteToGameActions');
    await expect(
      addExistingPlayerToGame(GAME_ID, formData({ recipient_user_id: RECIPIENT_ID })),
    ).rejects.toBeInstanceOf(RedirectError);

    // Ingen ny notify ved race-duplicate.
    expect(notifyInvitedToGameMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).toHaveBeenCalled();
    expect(lastRedirect()).toBe(`/admin/games/${GAME_ID}?status=invite_added`);
  });

  it('inviter-self: skip notify, men game_players-insert kjører fortsatt', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, email: 'admin@tornygolf.no', name: 'Jørgen' }, error: null },
      {
        data: { id: GAME_ID, name: 'Vinter-cup', status: 'draft', game_mode: 'best_ball' },
        error: null,
      },
      { data: [], error: null, count: 2 } as never,
      { data: null, error: null },
    ]);
    authedAsAdmin();

    const { addExistingPlayerToGame } = await import('./inviteToGameActions');
    await expect(
      addExistingPlayerToGame(GAME_ID, formData({ recipient_user_id: ADMIN_ID })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(notifyInvitedToGameMock).not.toHaveBeenCalled();
  });

  it('avviser når recipient_user_id mangler i form', async () => {
    // Auth kjører før form-validering nå (#429), så loadRole-lesningen må svare.
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, email: 'admin@tornygolf.no', name: 'Jørgen' }, error: null },
    ]);
    authedAsAdmin();

    const { addExistingPlayerToGame } = await import('./inviteToGameActions');
    await expect(
      addExistingPlayerToGame(GAME_ID, formData({})),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe(`/admin/games/${GAME_ID}?error=invite_missing_user`);
  });

  it('oppretter (ikke-admin): legger til spiller, lander på /games/[id]/spillere', async () => {
    supabaseMock = buildSupabaseMock([
      CREATOR_ROLE_READ,
      CREATOR_OWNS_GAME,
      {
        data: { id: GAME_ID, name: 'Lørdagsrunde', status: 'scheduled', game_mode: 'stableford' },
        error: null,
      },
      // game_players insert (stableford → ingen capacity-check)
      { data: null, error: null },
    ]);
    authedAsCreator();

    const { addExistingPlayerToGame } = await import('./inviteToGameActions');
    await expect(
      addExistingPlayerToGame(GAME_ID, formData({ recipient_user_id: RECIPIENT_ID })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(notifyInvitedToGameMock).toHaveBeenCalledWith({
      recipientUserId: RECIPIENT_ID,
      gameId: GAME_ID,
      inviterUserId: CREATOR_ID,
    });
    expect(lastRedirect()).toBe(`/games/${GAME_ID}/spillere?status=invite_added`);
  });

  it('avviser ikke-best-ball-modus ved 10 spillere (ingen øvre grense)', async () => {
    // stableford solo har ingen max — vi skipper capacity-checken og kommer
    // rett til insertet.
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, email: 'admin@tornygolf.no', name: 'Jørgen' }, error: null },
      {
        data: { id: GAME_ID, name: 'Klubbcup', status: 'scheduled', game_mode: 'stableford' },
        error: null,
      },
      { data: null, error: null },
    ]);
    authedAsAdmin();

    const { addExistingPlayerToGame } = await import('./inviteToGameActions');
    await expect(
      addExistingPlayerToGame(GAME_ID, formData({ recipient_user_id: RECIPIENT_ID })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(notifyInvitedToGameMock).toHaveBeenCalled();
    expect(lastRedirect()).toBe(`/admin/games/${GAME_ID}?status=invite_added`);
  });
});

describe('inviteEmailToGame', () => {
  it('eksisterende e-post: går gjennom picker-stien (ingen mail, men notify)', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, email: 'admin@tornygolf.no', name: 'Jørgen' }, error: null },
      {
        data: { id: GAME_ID, name: 'Vinter-cup', status: 'scheduled', game_mode: 'best_ball' },
        error: null,
      },
      { data: [], error: null, count: 4 } as never,
      // users.select.ilike.maybeSingle — finner eksisterende
      { data: { id: RECIPIENT_ID }, error: null },
      // game_players insert
      { data: null, error: null },
    ]);
    authedAsAdmin();

    const { inviteEmailToGame } = await import('./inviteToGameActions');
    await expect(
      inviteEmailToGame(GAME_ID, formData({ email: 'kompis@example.com' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(sendInviteNotificationMock).not.toHaveBeenCalled();
    expect(notifyInvitedToGameMock).toHaveBeenCalledWith({
      recipientUserId: RECIPIENT_ID,
      gameId: GAME_ID,
      inviterUserId: ADMIN_ID,
    });
    expect(lastRedirect()).toContain('status=invite_added');
  });

  it('ukjent e-post: insert i invitations + spill-spesifikk mail, ingen notify', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, email: 'admin@tornygolf.no', name: 'Jørgen' }, error: null },
      {
        data: { id: GAME_ID, name: 'Stiklestad', status: 'scheduled', game_mode: 'stableford' },
        error: null,
      },
      // users.select.ilike.maybeSingle — ingen treff
      { data: null, error: null },
      // invitations.select.ilike.eq.is.maybeSingle — ingen pending
      { data: null, error: null },
      // invitations insert
      { data: null, error: null },
    ]);
    authedAsAdmin();

    const { inviteEmailToGame } = await import('./inviteToGameActions');
    await expect(
      inviteEmailToGame(GAME_ID, formData({ email: 'NyKompis@Example.com' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(sendInviteNotificationMock).toHaveBeenCalledWith({
      to: 'nykompis@example.com',
      invitedByName: 'Jørgen',
      gameName: 'Stiklestad',
      gameMode: 'stableford',
    });
    expect(notifyInvitedToGameMock).not.toHaveBeenCalled();
    expect(lastRedirect()).toContain('status=invite_sent');
    expect(lastRedirect()).toContain('email=nykompis');
  });

  it('idempotent: pending invitation for samme spill swallow-es', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, email: 'admin@tornygolf.no', name: 'Jørgen' }, error: null },
      {
        data: { id: GAME_ID, name: 'Stiklestad', status: 'scheduled', game_mode: 'stableford' },
        error: null,
      },
      // users.select.ilike.maybeSingle — ingen treff
      { data: null, error: null },
      // invitations.select.ilike.eq.is.maybeSingle — pending finnes
      { data: { id: 'invitation-1' }, error: null },
    ]);
    authedAsAdmin();

    const { inviteEmailToGame } = await import('./inviteToGameActions');
    await expect(
      inviteEmailToGame(GAME_ID, formData({ email: 'kompis@example.com' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(sendInviteNotificationMock).not.toHaveBeenCalled();
    expect(notifyInvitedToGameMock).not.toHaveBeenCalled();
    expect(lastRedirect()).toContain('status=invite_sent');
  });

  it('avviser ugyldig e-post', async () => {
    // Auth kjører før e-post-validering nå (#429).
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, email: 'admin@tornygolf.no', name: 'Jørgen' }, error: null },
    ]);
    authedAsAdmin();

    const { inviteEmailToGame } = await import('./inviteToGameActions');
    await expect(
      inviteEmailToGame(GAME_ID, formData({ email: 'not-an-email' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe(`/admin/games/${GAME_ID}?error=invite_invalid_email`);
  });

  it('oppretter (ikke-admin): ukjent e-post → invitations-insert + mail, lander på /games/[id]/spillere', async () => {
    supabaseMock = buildSupabaseMock([
      CREATOR_ROLE_READ,
      CREATOR_OWNS_GAME,
      {
        data: { id: GAME_ID, name: 'Lørdagsrunde', status: 'scheduled', game_mode: 'stableford' },
        error: null,
      },
      // users.select.ilike.maybeSingle — ingen treff
      { data: null, error: null },
      // invitations.select…maybeSingle — ingen pending
      { data: null, error: null },
      // invitations insert
      { data: null, error: null },
    ]);
    authedAsCreator();

    const { inviteEmailToGame } = await import('./inviteToGameActions');
    await expect(
      inviteEmailToGame(GAME_ID, formData({ email: 'ny@example.com' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(sendInviteNotificationMock).toHaveBeenCalledWith({
      to: 'ny@example.com',
      invitedByName: 'Kari',
      gameName: 'Lørdagsrunde',
      gameMode: 'stableford',
    });
    expect(lastRedirect()).toContain(`/games/${GAME_ID}/spillere?status=invite_sent`);
  });

  it('oppretter (ikke-admin): disposable-domene blokkeres før mail', async () => {
    supabaseMock = buildSupabaseMock([CREATOR_ROLE_READ, CREATOR_OWNS_GAME]);
    authedAsCreator();

    const { inviteEmailToGame } = await import('./inviteToGameActions');
    await expect(
      inviteEmailToGame(GAME_ID, formData({ email: 'throwaway@mailinator.com' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(sendInviteNotificationMock).not.toHaveBeenCalled();
    expect(lastRedirect()).toBe(`/games/${GAME_ID}/spillere?error=disposable_email`);
  });

  it('admin: disposable-domene blokkeres IKKE (kurator-unntak #422)', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, email: 'admin@tornygolf.no', name: 'Jørgen' }, error: null },
      {
        data: { id: GAME_ID, name: 'Stiklestad', status: 'scheduled', game_mode: 'stableford' },
        error: null,
      },
      // users.select.ilike.maybeSingle — ingen treff
      { data: null, error: null },
      // invitations pending — ingen
      { data: null, error: null },
      // invitations insert
      { data: null, error: null },
    ]);
    authedAsAdmin();

    const { inviteEmailToGame } = await import('./inviteToGameActions');
    await expect(
      inviteEmailToGame(GAME_ID, formData({ email: 'throwaway@mailinator.com' })),
    ).rejects.toBeInstanceOf(RedirectError);

    // Admin slipper gjennom guarden → mail sendes.
    expect(sendInviteNotificationMock).toHaveBeenCalled();
    expect(lastRedirect()).toContain('status=invite_sent');
  });

  it('avviser game_locked når spillet er active', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, email: 'admin@tornygolf.no', name: 'Jørgen' }, error: null },
      {
        data: { id: GAME_ID, name: 'Stiklestad', status: 'active', game_mode: 'stableford' },
        error: null,
      },
    ]);
    authedAsAdmin();

    const { inviteEmailToGame } = await import('./inviteToGameActions');
    await expect(
      inviteEmailToGame(GAME_ID, formData({ email: 'kompis@example.com' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe(`/admin/games/${GAME_ID}?error=game_locked`);
  });
});
