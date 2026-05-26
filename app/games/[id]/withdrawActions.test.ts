import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

/**
 * Unit-tester for self-withdraw (#199 chunk 11).
 *
 * Verifiserer:
 *   - Uautentisert → redirect /login
 *   - Spill ikke funnet → game_not_found
 *   - Spill aktivt/finished → game_locked
 *   - Bruker ikke påmeldt → not_registered
 *   - Suksess solo (team_number=null) → DELETE + revalidateTag (ingen notify)
 *   - Suksess team-medlem → DELETE + notify kaptein
 *   - DB-feil ved DELETE → db_error
 */

const redirectMock = makeRedirectMock();
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));

const revalidateTagMock = vi.fn();
vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
}));

const notifyMock = vi.fn(async () => ({ shouldAlsoSendMail: false }));
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
    expect(redirectMock).toHaveBeenCalledWith('/login');
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

  it('spill er aktivt → game_locked', async () => {
    authedAsUser();
    adminMock = buildSupabaseMock([
      // 1) games — active
      {
        data: {
          id: GAME_ID,
          name: 'X',
          short_id: 'abc12345',
          status: 'active',
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

    expect(result).toEqual({ ok: true });
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

    expect(result).toEqual({ ok: true });
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
