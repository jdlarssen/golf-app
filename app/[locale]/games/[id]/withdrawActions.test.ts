import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeLocaleRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

/**
 * Unit-tester for self-withdraw (#199 chunk 11, #386 chunk 3).
 *
 * withdrawFromGame:
 *   - Uautentisert → redirect /login
 *   - Spill ikke funnet → game_not_found
 *   - Spill aktivt + in-scope-modus → UPDATE withdrawn_at (ikke DELETE)
 *   - Spill aktivt + out-of-scope-modus → game_locked
 *   - Spill finished → game_locked
 *   - Bruker ikke påmeldt → not_registered
 *   - Suksess solo (team_number=null) → DELETE + revalidateTag (ingen notify)
 *   - Suksess team-medlem → DELETE + notify kaptein
 *   - DB-feil ved DELETE → db_error
 *
 * undoWithdraw:
 *   - Aktivt spill + egne WD-rad → nullstiller withdrawn_at
 *   - Bruker ikke trukket → not_registered
 */

const redirectMock = makeLocaleRedirectMock();
vi.mock('@/i18n/navigation', () => ({
  redirect: (arg: { href: string; locale?: string } | string) =>
    redirectMock(arg),
}));
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'nb',
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

let serverMock: ReturnType<typeof buildSupabaseMock>;
let adminMock: ReturnType<typeof buildSupabaseMock>;

vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => serverMock,
}));

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminMock,
}));

const USER_ID = '11111111-1111-1111-1111-111111111111';
const GAME_ID = '22222222-2222-2222-2222-222222222222';
const CAPTAIN_ID = '33333333-3333-3333-3333-333333333333';
const TEAMMATE_ID = '44444444-4444-4444-4444-444444444444';
const CAPTAIN_REQ_ID = '55555555-5555-5555-5555-555555555555';

function authedAsUser(): void {
  serverMock = buildSupabaseMock([]);
  (serverMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { user: { id: USER_ID } },
  });
}

function unauthed(): void {
  serverMock = buildSupabaseMock([]);
  (serverMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { user: null },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  serverMock = buildSupabaseMock([]);
  adminMock = buildSupabaseMock([]);
});

describe('withdrawFromGame', () => {
  it('uautentisert → redirect /login', async () => {
    unauthed();
    const { withdrawFromGame } = await import('./withdrawActions');

    await expect(withdrawFromGame(GAME_ID)).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(redirectMock).toHaveBeenCalledWith(
      expect.objectContaining({ href: '/login' }),
    );
  });

  it('ugyldig gameId-format → game_not_found uten DB-call', async () => {
    authedAsUser();
    const { withdrawFromGame } = await import('./withdrawActions');

    const result = await withdrawFromGame('not-a-uuid');
    expect(result).toEqual({ ok: false, error: 'game_not_found' });
  });

  it('spill ikke funnet → game_not_found', async () => {
    authedAsUser();
    adminMock = buildSupabaseMock([
      // 1) games lookup
      { data: null, error: null },
      // 2) game_players lookup (parallel)
      { data: null, error: null },
    ]);
    const { withdrawFromGame } = await import('./withdrawActions');

    const result = await withdrawFromGame(GAME_ID);
    expect(result).toEqual({ ok: false, error: 'game_not_found' });
  });

  it('spill er aktivt + in-scope modus (best_ball) → UPDATE withdrawn_at, ikke DELETE', async () => {
    authedAsUser();
    adminMock = buildSupabaseMock([
      // 1) games — active, best_ball (in-scope)
      {
        data: {
          id: GAME_ID,
          name: 'X',
          short_id: 'abc12345',
          status: 'active',
          game_mode: 'best_ball',
        },
        error: null,
      },
      // 2) game_players — bruker er påmeldt
      { data: { user_id: USER_ID, team_number: null }, error: null },
      // 3) UPDATE game_players (set withdrawn_at)
      { data: null, error: null },
    ]);
    const { withdrawFromGame } = await import('./withdrawActions');

    const result = await withdrawFromGame(GAME_ID);
    expect(result).toEqual({ ok: true, kept: true });
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, 'max');
    // Skal ikke slette raden
    const deleteCalls = adminMock.__fromCalls.filter(
      (c) => c.method === 'delete',
    );
    expect(deleteCalls).toHaveLength(0);
    // Skal UPDATE game_players
    const updateCalls = adminMock.__fromCalls.filter(
      (c) => c.method === 'update',
    );
    expect(updateCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('spill er aktivt + out-of-scope modus (wolf) → game_locked', async () => {
    authedAsUser();
    adminMock = buildSupabaseMock([
      // 1) games — active, wolf (out-of-scope)
      {
        data: {
          id: GAME_ID,
          name: 'X',
          short_id: 'abc12345',
          status: 'active',
          game_mode: 'wolf',
        },
        error: null,
      },
      // 2) game_players — bruker er påmeldt
      { data: { user_id: USER_ID, team_number: null }, error: null },
    ]);
    const { withdrawFromGame } = await import('./withdrawActions');

    const result = await withdrawFromGame(GAME_ID);
    expect(result).toEqual({ ok: false, error: 'game_locked' });
  });

  it('bruker ikke påmeldt → not_registered', async () => {
    authedAsUser();
    adminMock = buildSupabaseMock([
      // 1) games — scheduled
      {
        data: {
          id: GAME_ID,
          name: 'X',
          short_id: 'abc12345',
          status: 'scheduled',
          game_mode: 'best_ball',
        },
        error: null,
      },
      // 2) game_players — ingen rad for brukeren
      { data: null, error: null },
    ]);
    const { withdrawFromGame } = await import('./withdrawActions');

    const result = await withdrawFromGame(GAME_ID);
    expect(result).toEqual({ ok: false, error: 'not_registered' });
  });

  it('suksess solo (team_number=null) → DELETE + revalidate, ingen notify', async () => {
    authedAsUser();
    adminMock = buildSupabaseMock([
      // 1) games — draft
      {
        data: {
          id: GAME_ID,
          name: 'Sommercup',
          short_id: 'abc12345',
          status: 'draft',
          game_mode: 'best_ball',
        },
        error: null,
      },
      // 2) game_players — solo (team_number=null)
      { data: { user_id: USER_ID, team_number: null }, error: null },
      // 3) DELETE game_players
      { data: null, error: null },
      // 4) DELETE game_registration_requests
      { data: null, error: null },
    ]);
    const { withdrawFromGame } = await import('./withdrawActions');

    const result = await withdrawFromGame(GAME_ID);

    expect(result).toEqual({ ok: true, kept: false });
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, 'max');
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('suksess team-medlem → DELETE + notify kaptein med team_member_withdrew', async () => {
    authedAsUser();
    adminMock = buildSupabaseMock([
      // 1) games
      {
        data: {
          id: GAME_ID,
          name: 'Sommercup',
          short_id: 'abc12345',
          status: 'scheduled',
          game_mode: 'best_ball',
        },
        error: null,
      },
      // 2) game_players — team_number=1
      { data: { user_id: USER_ID, team_number: 1 }, error: null },
      // 3) mates lookup (samme team_number) → finnes en til
      { data: [{ user_id: TEAMMATE_ID }], error: null },
      // 4) min request-rad (team_name + team_request_id)
      {
        data: {
          team_name: 'Bjørka',
          team_request_id: CAPTAIN_REQ_ID,
          is_team_captain: false,
        },
        error: null,
      },
      // 5) captain request lookup
      { data: { user_id: CAPTAIN_ID }, error: null },
      // 6) DELETE game_players
      { data: null, error: null },
      // 7) DELETE game_registration_requests
      { data: null, error: null },
      // 8) users lookup for navnet i payload
      {
        data: { name: 'Per Spiller', nickname: null, email: 'p@x.no' },
        error: null,
      },
    ]);
    const { withdrawFromGame } = await import('./withdrawActions');

    const result = await withdrawFromGame(GAME_ID);

    expect(result).toEqual({ ok: true, kept: false });
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, 'max');
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: CAPTAIN_ID,
        kind: 'team_member_withdrew',
        payload: expect.objectContaining({
          game_id: GAME_ID,
          game_short_id: 'abc12345',
          game_name: 'Sommercup',
          withdrawn_player_name: 'Per Spiller',
          team_name: 'Bjørka',
        }),
      }),
    );
  });

  it('DB-feil ved DELETE → db_error', async () => {
    authedAsUser();
    adminMock = buildSupabaseMock([
      // 1) games
      {
        data: {
          id: GAME_ID,
          name: 'X',
          short_id: 'abc12345',
          status: 'scheduled',
          game_mode: 'best_ball',
        },
        error: null,
      },
      // 2) game_players (solo)
      { data: { user_id: USER_ID, team_number: null }, error: null },
      // 3) DELETE feiler
      { data: null, error: { code: '12345', message: 'sql crashed' } },
    ]);
    const { withdrawFromGame } = await import('./withdrawActions');

    const result = await withdrawFromGame(GAME_ID);
    expect(result).toEqual({ ok: false, error: 'db_error' });
    expect(notifyMock).not.toHaveBeenCalled();
  });
});

describe('undoWithdraw', () => {
  it('aktivt spill + spilleren er trukket → nullstiller withdrawn_at', async () => {
    authedAsUser();
    adminMock = buildSupabaseMock([
      // 1) games — active, in-scope
      {
        data: {
          id: GAME_ID,
          status: 'active',
          game_mode: 'best_ball',
        },
        error: null,
      },
      // 2) game_players — trukket
      {
        data: { user_id: USER_ID, withdrawn_at: '2026-06-01T10:00:00.000Z' },
        error: null,
      },
      // 3) UPDATE game_players (clear withdrawn_at)
      { data: null, error: null },
    ]);
    const { undoWithdraw } = await import('./withdrawActions');

    const result = await undoWithdraw(GAME_ID);
    expect(result).toEqual({ ok: true });
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, 'max');
    const updateCalls = adminMock.__fromCalls.filter(
      (c) => c.method === 'update',
    );
    expect(updateCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('spilleren er ikke trukket (withdrawn_at=null) → not_registered', async () => {
    authedAsUser();
    adminMock = buildSupabaseMock([
      // 1) games — active
      {
        data: {
          id: GAME_ID,
          status: 'active',
          game_mode: 'best_ball',
        },
        error: null,
      },
      // 2) game_players — ikke trukket
      { data: { user_id: USER_ID, withdrawn_at: null }, error: null },
    ]);
    const { undoWithdraw } = await import('./withdrawActions');

    const result = await undoWithdraw(GAME_ID);
    expect(result).toEqual({ ok: false, error: 'not_registered' });
  });

  it('spill er finished → game_locked', async () => {
    authedAsUser();
    adminMock = buildSupabaseMock([
      // 1) games — finished
      {
        data: {
          id: GAME_ID,
          status: 'finished',
          game_mode: 'best_ball',
        },
        error: null,
      },
      // 2) game_players (not needed, gate fires first)
      { data: { user_id: USER_ID, withdrawn_at: '2026-06-01T10:00:00.000Z' }, error: null },
    ]);
    const { undoWithdraw } = await import('./withdrawActions');

    const result = await undoWithdraw(GAME_ID);
    expect(result).toEqual({ ok: false, error: 'game_locked' });
  });
});
