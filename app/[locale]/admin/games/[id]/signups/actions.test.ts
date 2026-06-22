import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeLocaleRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

/**
 * Unit-tester for approve/reject server-actions på /admin/games/[id]/signups
 * (#199). Verifiserer:
 *  - Auth via requireAdmin (admin-only).
 *  - Status gate: kun pending-requests kan avgjøres.
 *  - Game-lock gate: active/finished blokkerer.
 *  - Cascade for kaptein-rader (alle team-children oppdateres samme status).
 *  - notify() fyrer for hver påvirket bruker med rett payload + kind.
 *  - revalidateTag invalidates spillet etter mutasjon.
 *  - Honeypot-felt på reject-formen silent-rejecter.
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

const notifyMock = vi.fn<
  (...args: unknown[]) => Promise<{ shouldAlsoSendMail: boolean }>
>(async () => ({ shouldAlsoSendMail: false }));
vi.mock('@/lib/notifications/notify', () => ({
  notify: (...args: unknown[]) => notifyMock(...args),
}));

// `getAdminClient()` returnerer en separat mock-instans fra serverClient. Vi
// reuserer buildSupabaseMock for begge — adminMock har egen kø av results.
let serverMock: ReturnType<typeof buildSupabaseMock>;
let adminMock: ReturnType<typeof buildSupabaseMock>;

vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => serverMock,
}));

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminMock,
}));

const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const SOLO_USER_ID = '22222222-2222-2222-2222-222222222222';
const CAPTAIN_USER_ID = '33333333-3333-3333-3333-333333333333';
const MATE_USER_ID = '44444444-4444-4444-4444-444444444444';
const GAME_ID = '55555555-5555-5555-5555-555555555555';
const SOLO_REQUEST_ID = '66666666-6666-6666-6666-666666666666';
const CAPTAIN_REQUEST_ID = '77777777-7777-7777-7777-777777777777';
const MATE_REQUEST_ID = '88888888-8888-8888-8888-888888888888';

function authedAsAdmin(): void {
  (serverMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { user: { id: ADMIN_ID, email: 'admin@tornygolf.no' } },
  });
}

function lastRedirect(): string | undefined {
  const arg = redirectMock.mock.calls.at(-1)?.[0];
  if (!arg) return undefined;
  return typeof arg === 'string' ? arg : arg.href;
}

function fd(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.set(k, v);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('approveRequest', () => {
  it('approve-er en pending solo-request: oppdaterer status, insertes i game_players, notify fyrer', async () => {
    serverMock = buildSupabaseMock([
      // requireAdmin: users.select.single
      {
        data: { is_admin: true, email: 'admin@tornygolf.no', name: 'Jørgen' },
        error: null,
      },
    ]);
    adminMock = buildSupabaseMock([
      // load request
      {
        data: {
          id: SOLO_REQUEST_ID,
          game_id: GAME_ID,
          user_id: SOLO_USER_ID,
          status: 'pending',
          is_team_captain: false,
          team_name: null,
          team_request_id: null,
        },
        error: null,
      },
      // load game
      {
        data: {
          id: GAME_ID,
          name: 'Vinter-cup',
          status: 'scheduled',
          created_by: ADMIN_ID,
        },
        error: null,
      },
      // UPDATE game_registration_requests — #712: .select() returns affected rows
      { data: [{ id: SOLO_REQUEST_ID }], error: null },
      // UPSERT game_players
      { data: null, error: null },
    ]);
    authedAsAdmin();

    const { approveRequest } = await import('./actions');
    await expect(approveRequest(SOLO_REQUEST_ID)).rejects.toBeInstanceOf(
      RedirectError,
    );

    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: SOLO_USER_ID,
        kind: 'registration_approved',
        payload: expect.objectContaining({
          game_id: GAME_ID,
          game_name: 'Vinter-cup',
        }),
      }),
    );
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, 'max');
    expect(lastRedirect()).toBe(
      `/admin/games/${GAME_ID}/signups?status=approved`,
    );

    // Verify rekkefølge: UPDATE før UPSERT (status før game_players-insert)
    const calls = adminMock.__fromCalls;
    const updateIdx = calls.findIndex((c) => c.method === 'update');
    const upsertIdx = calls.findIndex((c) => c.method === 'upsert');
    expect(updateIdx).toBeGreaterThanOrEqual(0);
    expect(upsertIdx).toBeGreaterThan(updateIdx);
  });

  it('cascade approve: kaptein + medspillere oppdateres samtidig, notify fyrer for hver', async () => {
    serverMock = buildSupabaseMock([
      {
        data: { is_admin: true, email: 'admin@tornygolf.no', name: 'Jørgen' },
        error: null,
      },
    ]);
    adminMock = buildSupabaseMock([
      // load request (kaptein)
      {
        data: {
          id: CAPTAIN_REQUEST_ID,
          game_id: GAME_ID,
          user_id: CAPTAIN_USER_ID,
          status: 'pending',
          is_team_captain: true,
          team_name: 'Albatross',
          team_request_id: null,
        },
        error: null,
      },
      // load game
      {
        data: {
          id: GAME_ID,
          name: 'Scramble-runde',
          status: 'scheduled',
          created_by: ADMIN_ID,
        },
        error: null,
      },
      // load team children
      {
        data: [{ id: MATE_REQUEST_ID, user_id: MATE_USER_ID }],
        error: null,
      },
      // existing teams (none taken → slot 1)
      { data: [], error: null },
      // UPDATE status (kaptein + medspiller) — #712: .select() returns affected rows
      { data: [{ id: CAPTAIN_REQUEST_ID }, { id: MATE_REQUEST_ID }], error: null },
      // UPSERT game_players (kaptein + medspiller)
      { data: null, error: null },
    ]);
    authedAsAdmin();

    const { approveRequest } = await import('./actions');
    await expect(approveRequest(CAPTAIN_REQUEST_ID)).rejects.toBeInstanceOf(
      RedirectError,
    );

    expect(notifyMock).toHaveBeenCalledTimes(2);
    const notifiedUsers = notifyMock.mock.calls.map(
      (c) => (c[0] as { userId: string }).userId,
    );
    expect(notifiedUsers).toContain(CAPTAIN_USER_ID);
    expect(notifiedUsers).toContain(MATE_USER_ID);
  });

  it('#662: kaptein godkjent når slot 1–4 tatt → tildeles slot 5', async () => {
    // Regression-guard: approvePath used `slot <= 4` which blocked approval
    // when slots 1–4 were occupied. Fixed to `slot <= 50` (same as teamActions).
    serverMock = buildSupabaseMock([
      {
        data: { is_admin: true, email: 'admin@tornygolf.no', name: 'Jørgen' },
        error: null,
      },
    ]);
    adminMock = buildSupabaseMock([
      // load request (kaptein)
      {
        data: {
          id: CAPTAIN_REQUEST_ID,
          game_id: GAME_ID,
          user_id: CAPTAIN_USER_ID,
          status: 'pending',
          is_team_captain: true,
          team_name: 'Lag Fem',
          team_request_id: null,
        },
        error: null,
      },
      // load game
      {
        data: {
          id: GAME_ID,
          name: 'Best Ball-turnering',
          status: 'scheduled',
          created_by: ADMIN_ID,
        },
        error: null,
      },
      // no team children (solo captain for simplicity)
      { data: [], error: null },
      // existing teams: slots 1–4 taken
      {
        data: [
          { team_number: 1 },
          { team_number: 2 },
          { team_number: 3 },
          { team_number: 4 },
        ],
        error: null,
      },
      // UPDATE status — #712: .select() returns affected rows
      { data: [{ id: CAPTAIN_REQUEST_ID }], error: null },
      // UPSERT game_players
      { data: null, error: null },
    ]);
    authedAsAdmin();

    const { approveRequest } = await import('./actions');
    await expect(approveRequest(CAPTAIN_REQUEST_ID)).rejects.toBeInstanceOf(
      RedirectError,
    );

    // Must succeed (not redirect to ?error=no_team_slot)
    expect(lastRedirect()).toBe(
      `/admin/games/${GAME_ID}/signups?status=approved`,
    );

    // Verify team_number=5 was assigned in the upsert payload
    const upsertCall = adminMock.__fromCalls.find(
      (c) => c.table === 'game_players' && c.method === 'upsert',
    );
    expect(upsertCall).toBeDefined();
    const rows = upsertCall!.args[0] as Array<{ team_number: number }>;
    expect(rows[0]?.team_number).toBe(5);
  });

  it('avviser når status er allerede approved (not_pending)', async () => {
    serverMock = buildSupabaseMock([
      {
        data: { is_admin: true, email: 'admin@tornygolf.no', name: 'Jørgen' },
        error: null,
      },
    ]);
    adminMock = buildSupabaseMock([
      {
        data: {
          id: SOLO_REQUEST_ID,
          game_id: GAME_ID,
          user_id: SOLO_USER_ID,
          status: 'approved',
          is_team_captain: false,
          team_name: null,
          team_request_id: null,
        },
        error: null,
      },
      {
        data: {
          id: GAME_ID,
          name: 'Vinter-cup',
          status: 'scheduled',
          created_by: ADMIN_ID,
        },
        error: null,
      },
    ]);
    authedAsAdmin();

    const { approveRequest } = await import('./actions');
    await expect(approveRequest(SOLO_REQUEST_ID)).rejects.toBeInstanceOf(
      RedirectError,
    );

    expect(notifyMock).not.toHaveBeenCalled();
    expect(lastRedirect()).toBe(
      `/admin/games/${GAME_ID}/signups?error=not_pending`,
    );
  });

  it('#712: 0-row UPDATE (alle requests allerede behandlet) → error redirect, ingen notify', async () => {
    // Race: to admin-faner forsøker å godkjenne samme forespørsel. Andre tab
    // vinner — vår UPDATE matcher 0 pending-rader. expectAffected kaster
    // NoRowsAffectedError, vi redirecter til ?error=db_update uten notify.
    serverMock = buildSupabaseMock([
      {
        data: { is_admin: true, email: 'admin@tornygolf.no', name: 'Jørgen' },
        error: null,
      },
    ]);
    adminMock = buildSupabaseMock([
      {
        data: {
          id: SOLO_REQUEST_ID,
          game_id: GAME_ID,
          user_id: SOLO_USER_ID,
          status: 'pending',
          is_team_captain: false,
          team_name: null,
          team_request_id: null,
        },
        error: null,
      },
      {
        data: {
          id: GAME_ID,
          name: 'Vinter-cup',
          status: 'scheduled',
          created_by: ADMIN_ID,
        },
        error: null,
      },
      // UPDATE returns 0 rows (all requests already decided by another actor)
      { data: [], error: null },
    ]);
    authedAsAdmin();

    const { approveRequest } = await import('./actions');
    await expect(approveRequest(SOLO_REQUEST_ID)).rejects.toBeInstanceOf(
      RedirectError,
    );

    expect(lastRedirect()).toBe(
      `/admin/games/${GAME_ID}/signups?error=db_update`,
    );
    // Critical: no notification sent when write was a no-op
    expect(notifyMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('avviser når spillet er active (game-lock)', async () => {
    serverMock = buildSupabaseMock([
      {
        data: { is_admin: true, email: 'admin@tornygolf.no', name: 'Jørgen' },
        error: null,
      },
    ]);
    adminMock = buildSupabaseMock([
      {
        data: {
          id: SOLO_REQUEST_ID,
          game_id: GAME_ID,
          user_id: SOLO_USER_ID,
          status: 'pending',
          is_team_captain: false,
          team_name: null,
          team_request_id: null,
        },
        error: null,
      },
      {
        data: {
          id: GAME_ID,
          name: 'Vinter-cup',
          status: 'active',
          created_by: ADMIN_ID,
        },
        error: null,
      },
    ]);
    authedAsAdmin();

    const { approveRequest } = await import('./actions');
    await expect(approveRequest(SOLO_REQUEST_ID)).rejects.toBeInstanceOf(
      RedirectError,
    );

    expect(notifyMock).not.toHaveBeenCalled();
    expect(lastRedirect()).toBe(
      `/admin/games/${GAME_ID}/signups?error=game_locked`,
    );
  });
});

describe('rejectRequest', () => {
  it('reject-er med reason: oppdaterer status + rejection_reason, notify inkluderer reason', async () => {
    serverMock = buildSupabaseMock([
      {
        data: { is_admin: true, email: 'admin@tornygolf.no', name: 'Jørgen' },
        error: null,
      },
    ]);
    adminMock = buildSupabaseMock([
      {
        data: {
          id: SOLO_REQUEST_ID,
          game_id: GAME_ID,
          user_id: SOLO_USER_ID,
          status: 'pending',
          is_team_captain: false,
          team_name: null,
          team_request_id: null,
        },
        error: null,
      },
      {
        data: {
          id: GAME_ID,
          name: 'Vinter-cup',
          status: 'scheduled',
          created_by: ADMIN_ID,
        },
        error: null,
      },
      // UPDATE — #712: .select() returns affected rows
      { data: [{ id: SOLO_REQUEST_ID }], error: null },
    ]);
    authedAsAdmin();

    const { rejectRequest } = await import('./actions');
    await expect(
      rejectRequest(SOLO_REQUEST_ID, fd({ reason: 'Fullt allerede' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: SOLO_USER_ID,
        kind: 'registration_rejected',
        payload: expect.objectContaining({
          game_id: GAME_ID,
          game_name: 'Vinter-cup',
          reason: 'Fullt allerede',
        }),
      }),
    );
    expect(lastRedirect()).toBe(
      `/admin/games/${GAME_ID}/signups?status=rejected`,
    );
  });

  it('cascade reject: kaptein + medspillere oppdateres, notify fyrer for hver', async () => {
    serverMock = buildSupabaseMock([
      {
        data: { is_admin: true, email: 'admin@tornygolf.no', name: 'Jørgen' },
        error: null,
      },
    ]);
    adminMock = buildSupabaseMock([
      {
        data: {
          id: CAPTAIN_REQUEST_ID,
          game_id: GAME_ID,
          user_id: CAPTAIN_USER_ID,
          status: 'pending',
          is_team_captain: true,
          team_name: 'Albatross',
          team_request_id: null,
        },
        error: null,
      },
      {
        data: {
          id: GAME_ID,
          name: 'Scramble-runde',
          status: 'scheduled',
          created_by: ADMIN_ID,
        },
        error: null,
      },
      // children
      {
        data: [{ id: MATE_REQUEST_ID, user_id: MATE_USER_ID }],
        error: null,
      },
      // UPDATE — #712: .select() returns affected rows
      { data: [{ id: CAPTAIN_REQUEST_ID }, { id: MATE_REQUEST_ID }], error: null },
    ]);
    authedAsAdmin();

    const { rejectRequest } = await import('./actions');
    await expect(
      rejectRequest(CAPTAIN_REQUEST_ID, fd({})),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(notifyMock).toHaveBeenCalledTimes(2);
  });

  it('honeypot-felt populated → silent reject uten DB-mutasjon', async () => {
    serverMock = buildSupabaseMock([
      {
        data: { is_admin: true, email: 'admin@tornygolf.no', name: 'Jørgen' },
        error: null,
      },
    ]);
    adminMock = buildSupabaseMock([
      {
        data: {
          id: SOLO_REQUEST_ID,
          game_id: GAME_ID,
          user_id: SOLO_USER_ID,
          status: 'pending',
          is_team_captain: false,
          team_name: null,
          team_request_id: null,
        },
        error: null,
      },
      {
        data: {
          id: GAME_ID,
          name: 'Vinter-cup',
          status: 'scheduled',
          created_by: ADMIN_ID,
        },
        error: null,
      },
    ]);
    authedAsAdmin();

    const { rejectRequest } = await import('./actions');
    await expect(
      rejectRequest(
        SOLO_REQUEST_ID,
        fd({ website: 'https://spam.example' }),
      ),
    ).rejects.toBeInstanceOf(RedirectError);

    // Bot ser samme suksess-redirect som ekte avvisning.
    expect(lastRedirect()).toBe(
      `/admin/games/${GAME_ID}/signups?status=rejected`,
    );
    // Critical: ingen notify, ingen revalidate.
    expect(notifyMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('reason for lang (>200 tegn) → error redirect', async () => {
    serverMock = buildSupabaseMock([
      {
        data: { is_admin: true, email: 'admin@tornygolf.no', name: 'Jørgen' },
        error: null,
      },
    ]);
    adminMock = buildSupabaseMock([
      {
        data: {
          id: SOLO_REQUEST_ID,
          game_id: GAME_ID,
          user_id: SOLO_USER_ID,
          status: 'pending',
          is_team_captain: false,
          team_name: null,
          team_request_id: null,
        },
        error: null,
      },
      {
        data: {
          id: GAME_ID,
          name: 'Vinter-cup',
          status: 'scheduled',
          created_by: ADMIN_ID,
        },
        error: null,
      },
    ]);
    authedAsAdmin();

    const { rejectRequest } = await import('./actions');
    await expect(
      rejectRequest(SOLO_REQUEST_ID, fd({ reason: 'x'.repeat(201) })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(notifyMock).not.toHaveBeenCalled();
    expect(lastRedirect()).toBe(
      `/admin/games/${GAME_ID}/signups?error=reason_too_long`,
    );
  });
});
