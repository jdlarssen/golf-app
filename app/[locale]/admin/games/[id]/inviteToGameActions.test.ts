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
 *  - Idempotency: duplicate (game_id, user_id) swallow-es; en allerede-pending
 *    invitasjon for samme spill oppretter ingen ny rad, men re-sender mailen
 *    best-effort så en tapt første-sending når fram ved retry (#686).
 *  - Mail-feil ved ny invitasjon ruller invitations-raden tilbake, så
 *    arrangøren kan prøve samme adresse på nytt (#686).
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

// Venne-/klubb-eligibility-resolveren (#906) bruker admin-client, så vi mocker
// den ut og styrer settet per test. Default: RECIPIENT_ID er kvalifisert, så de
// eksisterende ikke-admin-happy-path-testene fortsatt passerer.
const inviteEligibleIdsMock = vi.fn<(...args: unknown[]) => Promise<Set<string>>>(
  async () => new Set<string>([RECIPIENT_ID]),
);
vi.mock('@/lib/games/inviteEligibility', () => ({
  getInviteEligibleIds: (...args: unknown[]) => inviteEligibleIdsMock(...args),
}));

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => supabaseMock,
}));

// #1613: re-send-grenen forlenger expires_at via admin-klienten (RLS-en har
// ingen UPDATE-policy som dekker en ikke-admin arrangør). Egen mock-kø så
// testene kan skille admin-klient-skriv fra bruker-klient-lesninger.
let adminSupabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminSupabaseMock,
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
  adminSupabaseMock = buildSupabaseMock([]);
});

/**
 * #1445: loadGameForInvite folded a failed query into the same
 * `?error=not_found` redirect as a genuinely missing game. It now throws to the
 * route's error boundary (retryable) on a real failure and keeps the redirect
 * for a true 0-row result.
 */
describe('loadGameForInvite — feil vs. fravær (#1445)', () => {
  const DB_ERR = { message: 'AbortError: This operation was aborted', code: '' };
  const ADMIN_ROLE_READ = {
    data: { is_admin: true, email: 'admin@tornygolf.no', name: 'Jørgen' },
    error: null,
  };

  it('game-oppslaget feiler → kaster (ikke ?error=not_found)', async () => {
    supabaseMock = buildSupabaseMock([
      ADMIN_ROLE_READ,
      { data: null, error: DB_ERR },
    ]);
    authedAsAdmin();

    const { addExistingPlayerToGame } = await import('./inviteToGameActions');
    await expect(
      addExistingPlayerToGame(
        GAME_ID,
        formData({ recipient_user_id: RECIPIENT_ID }),
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining('AbortError'),
    });
    expect(redirectMock).not.toHaveBeenCalled();
    expect(
      supabaseMock.__fromCalls.filter((c) => c.method === 'insert'),
    ).toHaveLength(0);
  });

  it('ekte 0-rad beholder ?error=not_found', async () => {
    // strictSingle (#1693): låser .maybeSingle()-byttet på game-oppslaget.
    supabaseMock = buildSupabaseMock(
      [ADMIN_ROLE_READ, { data: null, error: null }],
      {},
      { strictSingle: true },
    );
    authedAsAdmin();

    const { addExistingPlayerToGame } = await import('./inviteToGameActions');
    await expect(
      addExistingPlayerToGame(
        GAME_ID,
        formData({ recipient_user_id: RECIPIENT_ID }),
      ),
    ).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe(`/admin/games/${GAME_ID}?error=not_found`);
  });
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

  it('#906: avviser ikke-kvalifisert recipient for ikke-admin oppretter', async () => {
    supabaseMock = buildSupabaseMock([
      CREATOR_ROLE_READ,
      CREATOR_OWNS_GAME,
      {
        data: { id: GAME_ID, name: 'Lørdagsrunde', status: 'scheduled', game_mode: 'stableford', group_id: null },
        error: null,
      },
      // INGEN insert: guarden avviser før vi når dit.
    ]);
    authedAsCreator();
    inviteEligibleIdsMock.mockResolvedValueOnce(new Set<string>());

    const { addExistingPlayerToGame } = await import('./inviteToGameActions');
    await expect(
      addExistingPlayerToGame(GAME_ID, formData({ recipient_user_id: RECIPIENT_ID })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(inviteEligibleIdsMock).toHaveBeenCalledWith(CREATOR_ID, null);
    expect(notifyInvitedToGameMock).not.toHaveBeenCalled();
    expect(lastRedirect()).toBe(`/games/${GAME_ID}/spillere?error=invite_not_allowed`);
  });

  it('#906: tillater kvalifisert recipient for ikke-admin oppretter (klubb-scope)', async () => {
    supabaseMock = buildSupabaseMock([
      CREATOR_ROLE_READ,
      CREATOR_OWNS_GAME,
      {
        data: { id: GAME_ID, name: 'Klubbrunde', status: 'scheduled', game_mode: 'stableford', group_id: 'club-1' },
        error: null,
      },
      { data: null, error: null }, // insert
    ]);
    authedAsCreator();
    // Default-mock har RECIPIENT_ID → kvalifisert. Bekreft at group_id sendes med.

    const { addExistingPlayerToGame } = await import('./inviteToGameActions');
    await expect(
      addExistingPlayerToGame(GAME_ID, formData({ recipient_user_id: RECIPIENT_ID })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(inviteEligibleIdsMock).toHaveBeenCalledWith(CREATOR_ID, 'club-1');
    expect(notifyInvitedToGameMock).toHaveBeenCalledWith({
      recipientUserId: RECIPIENT_ID,
      gameId: GAME_ID,
      inviterUserId: CREATOR_ID,
    });
    expect(lastRedirect()).toBe(`/games/${GAME_ID}/spillere?status=invite_added`);
  });

  it('#906: self er alltid lov — eligibility-resolveren konsulteres ikke', async () => {
    supabaseMock = buildSupabaseMock([
      CREATOR_ROLE_READ,
      CREATOR_OWNS_GAME,
      {
        data: { id: GAME_ID, name: 'Lørdagsrunde', status: 'scheduled', game_mode: 'stableford', group_id: null },
        error: null,
      },
      { data: null, error: null }, // insert
    ]);
    authedAsCreator();

    const { addExistingPlayerToGame } = await import('./inviteToGameActions');
    await expect(
      addExistingPlayerToGame(GAME_ID, formData({ recipient_user_id: CREATOR_ID })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(inviteEligibleIdsMock).not.toHaveBeenCalled();
    expect(notifyInvitedToGameMock).not.toHaveBeenCalled();
    expect(lastRedirect()).toBe(`/games/${GAME_ID}/spillere?status=invite_added`);
  });

  it('#906: admin slipper forbi eligibility-guarden (kurator-unntak)', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, email: 'admin@tornygolf.no', name: 'Jørgen' }, error: null },
      {
        data: { id: GAME_ID, name: 'Klubbcup', status: 'scheduled', game_mode: 'stableford', group_id: null },
        error: null,
      },
      { data: null, error: null }, // insert
    ]);
    authedAsAdmin();

    const { addExistingPlayerToGame } = await import('./inviteToGameActions');
    await expect(
      addExistingPlayerToGame(GAME_ID, formData({ recipient_user_id: RECIPIENT_ID })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(inviteEligibleIdsMock).not.toHaveBeenCalled();
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

    // #1169: mailen bærer samme token som invitations-raden — lenken /login
    // slår opp kontekstkortet med.
    const insertCall = supabaseMock.__fromCalls.find(
      (c) => c.table === 'invitations' && c.method === 'insert',
    );
    const insertedRow = insertCall?.args[0] as {
      token: string;
      expires_at: string;
    };
    expect(sendInviteNotificationMock).toHaveBeenCalledWith({
      to: 'nykompis@example.com',
      invitedByName: 'Jørgen',
      gameName: 'Stiklestad',
      gameMode: 'stableford',
      inviteToken: insertedRow.token,
      expiresAt: insertedRow.expires_at,
    });
    expect(notifyInvitedToGameMock).not.toHaveBeenCalled();
    expect(lastRedirect()).toContain('status=invite_sent');
    expect(lastRedirect()).toContain('email=nykompis');
  });

  it('idempotent: pending invitation re-sender mail best-effort (ingen ny rad)', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, email: 'admin@tornygolf.no', name: 'Jørgen' }, error: null },
      {
        data: { id: GAME_ID, name: 'Stiklestad', status: 'scheduled', game_mode: 'stableford' },
        error: null,
      },
      // users.select.ilike.maybeSingle — ingen treff
      { data: null, error: null },
      // invitations.select.ilike.eq.is.maybeSingle — pending finnes
      {
        data: { id: 'invitation-1', token: 'eeeeeeee-1111-2222-3333-444444444444' },
        error: null,
      },
    ]);
    // #1613: forlengelsen skriver via admin-klienten før mailen.
    adminSupabaseMock = buildSupabaseMock([
      { data: [{ id: 'invitation-1' }], error: null },
    ]);
    authedAsAdmin();

    const { inviteEmailToGame } = await import('./inviteToGameActions');
    await expect(
      inviteEmailToGame(GAME_ID, formData({ email: 'kompis@example.com' })),
    ).rejects.toBeInstanceOf(RedirectError);

    // Fix B (#686): en retry på en allerede-pending invitasjon sender mailen
    // på nytt best-effort, så en invitasjon som tapte mailen første gang
    // likevel når fram. Ingen ny invitations-rad opprettes (ingen insert).
    expect(sendInviteNotificationMock).toHaveBeenCalledWith({
      to: 'kompis@example.com',
      invitedByName: 'Jørgen',
      gameName: 'Stiklestad',
      gameMode: 'stableford',
      inviteToken: 'eeeeeeee-1111-2222-3333-444444444444',
      expiresAt: expect.any(String),
    });
    expect(notifyInvitedToGameMock).not.toHaveBeenCalled();
    expect(lastRedirect()).toContain('status=invite_sent');
  });

  it('re-send av UTLØPT pending: fristen forlenges og mailen bærer den nye (#1613)', async () => {
    const STALE_EXPIRES_AT = '2026-08-01T00:00:00.000Z';
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, email: 'admin@tornygolf.no', name: 'Jørgen' }, error: null },
      {
        data: { id: GAME_ID, name: 'Stiklestad', status: 'scheduled', game_mode: 'stableford' },
        error: null,
      },
      // users.select.ilike.maybeSingle — ingen treff
      { data: null, error: null },
      // invitations.select.ilike.eq.is.maybeSingle — pending, men utløpt
      {
        data: {
          id: 'invitation-1',
          token: 'eeeeeeee-1111-2222-3333-444444444444',
          expires_at: STALE_EXPIRES_AT,
        },
        error: null,
      },
    ]);
    adminSupabaseMock = buildSupabaseMock([
      // invitations.update.eq.is.select — forlengelsen treffer raden
      { data: [{ id: 'invitation-1' }], error: null },
    ]);
    authedAsAdmin();
    const before = Date.now();

    const { inviteEmailToGame } = await import('./inviteToGameActions');
    await expect(
      inviteEmailToGame(GAME_ID, formData({ email: 'kompis@example.com' })),
    ).rejects.toBeInstanceOf(RedirectError);

    // Forlengelsen skrives via admin-klienten (RLS har ingen UPDATE-policy som
    // dekker en ikke-admin arrangør — bruker-klient hadde no-op-et, felle 2/3),
    // låst til raden og fortsatt-pending.
    const updateCall = adminSupabaseMock.__fromCalls.find(
      (c) => c.table === 'invitations' && c.method === 'update',
    );
    expect(updateCall, 'admin-klient update på invitations mangler').toBeDefined();
    const written = (updateCall!.args[0] as { expires_at: string }).expires_at;
    const ttlMs = Date.parse(written) - before;
    // Full game-invite-TTL (14 d) fram i tid — ikke radens gamle frist.
    expect(ttlMs).toBeGreaterThanOrEqual(14 * 24 * 60 * 60 * 1000 - 10_000);
    expect(ttlMs).toBeLessThanOrEqual(14 * 24 * 60 * 60 * 1000 + 10_000);
    const eqOnId = adminSupabaseMock.__fromCalls.find(
      (c) => c.method === 'eq' && c.args[0] === 'id' && c.args[1] === 'invitation-1',
    );
    expect(eqOnId, 'forlengelsen må låses til rad-id').toBeDefined();
    const isPending = adminSupabaseMock.__fromCalls.find(
      (c) => c.method === 'is' && c.args[0] === 'accepted_at',
    );
    expect(isPending, 'forlengelsen må kreve accepted_at IS NULL').toBeDefined();

    // Mailen bærer den NYE fristen — aldri den utløpte.
    expect(sendInviteNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ expiresAt: written }),
    );
    expect(sendInviteNotificationMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ expiresAt: STALE_EXPIRES_AT }),
    );
    expect(lastRedirect()).toContain('status=invite_sent');
  });

  it('forlengelse som treffer 0 rader (akseptert i mellomtiden): ingen mail, error-redirect (#1613)', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, email: 'admin@tornygolf.no', name: 'Jørgen' }, error: null },
      {
        data: { id: GAME_ID, name: 'Stiklestad', status: 'scheduled', game_mode: 'stableford' },
        error: null,
      },
      // users.select.ilike.maybeSingle — ingen treff
      { data: null, error: null },
      // invitations.select.ilike.eq.is.maybeSingle — pending finnes
      {
        data: {
          id: 'invitation-1',
          token: 'eeeeeeee-1111-2222-3333-444444444444',
          expires_at: '2026-08-01T00:00:00.000Z',
        },
        error: null,
      },
    ]);
    adminSupabaseMock = buildSupabaseMock([
      // invitations.update.eq.is.select — raden ble akseptert/slettet i mellomtiden
      { data: [], error: null },
    ]);
    authedAsAdmin();

    const { inviteEmailToGame } = await import('./inviteToGameActions');
    await expect(
      inviteEmailToGame(GAME_ID, formData({ email: 'kompis@example.com' })),
    ).rejects.toBeInstanceOf(RedirectError);

    // Aldri mail uten gyldig frist (hele poenget med #1613).
    expect(sendInviteNotificationMock).not.toHaveBeenCalled();
    expect(lastRedirect()).toContain('error=invite_failed');
  });

  it('mail-feil ved ukjent e-post: ruller invitations-raden tilbake via row-id (#705)', async () => {
    const INSERTED_ROW_ID = 'aabbccdd-1111-2222-3333-444455556666';
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
      // invitations insert + .select('id').single() — returnerer den nye rad-id-en
      { data: { id: INSERTED_ROW_ID }, error: null },
      // rollback: invitations.delete.eq('id', INSERTED_ROW_ID) — lykkes
      { data: null, error: null },
    ]);
    authedAsAdmin();
    sendInviteNotificationMock.mockImplementationOnce(async () => {
      throw new Error('resend down');
    });

    const { inviteEmailToGame } = await import('./inviteToGameActions');
    await expect(
      inviteEmailToGame(GAME_ID, formData({ email: 'NyKompis@Example.com' })),
    ).rejects.toBeInstanceOf(RedirectError);

    // Mailen feilet → den nylig insertede raden slettes igjen, så en ny
    // sending på samme adresse ikke kortsluttes av idempotens-sjekken.
    expect(sendInviteNotificationMock).toHaveBeenCalledTimes(1);

    // Rollback MÅ skje på primærnøkkelen (row-id), ikke på email+game_id+accepted_at,
    // slik at en concurrently inserted pending-rad for samme email ikke utilsiktet slettes.
    const eqCallOnId = supabaseMock.__fromCalls.find(
      (c) => c.method === 'eq' && c.args[0] === 'id' && c.args[1] === INSERTED_ROW_ID,
    );
    expect(eqCallOnId, 'rollback .eq("id", insertedRowId) mangler i fromCalls').toBeDefined();
    const deleteCall = supabaseMock.__fromCalls.find((c) => c.method === 'delete');
    expect(deleteCall?.table).toBe('invitations');

    expect(lastRedirect()).toContain('error=mail_failed');
    expect(lastRedirect()).toContain('email=nykompis');
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

    const insertCall = supabaseMock.__fromCalls.find(
      (c) => c.table === 'invitations' && c.method === 'insert',
    );
    const insertedRow = insertCall?.args[0] as {
      token: string;
      expires_at: string;
    };
    expect(sendInviteNotificationMock).toHaveBeenCalledWith({
      to: 'ny@example.com',
      invitedByName: 'Kari',
      gameName: 'Lørdagsrunde',
      gameMode: 'stableford',
      inviteToken: insertedRow.token,
      expiresAt: insertedRow.expires_at,
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

  it('#906: eksisterende e-post ikke-kvalifisert for ikke-admin oppretter → avvist', async () => {
    supabaseMock = buildSupabaseMock([
      CREATOR_ROLE_READ,
      CREATOR_OWNS_GAME,
      {
        data: { id: GAME_ID, name: 'Lørdagsrunde', status: 'scheduled', game_mode: 'stableford', group_id: null },
        error: null,
      },
      // users.select.ilike.maybeSingle — finner eksisterende, men ikke-venn
      { data: { id: RECIPIENT_ID }, error: null },
      // INGEN insert: guarden avviser før dit.
    ]);
    authedAsCreator();
    inviteEligibleIdsMock.mockResolvedValueOnce(new Set<string>());

    const { inviteEmailToGame } = await import('./inviteToGameActions');
    await expect(
      inviteEmailToGame(GAME_ID, formData({ email: 'fremmed@example.com' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(inviteEligibleIdsMock).toHaveBeenCalledWith(CREATOR_ID, null);
    expect(sendInviteNotificationMock).not.toHaveBeenCalled();
    expect(notifyInvitedToGameMock).not.toHaveBeenCalled();
    expect(lastRedirect()).toBe(`/games/${GAME_ID}/spillere?error=invite_not_allowed`);
  });
});
