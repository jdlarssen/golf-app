import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

/**
 * Unit-tester for flightActions (#543).
 *
 * Dekker tre actions:
 *   - suggestFlightAssignment: authz-reject, happy-path (foreslår og skriver)
 *   - setPlayerFlight: kapasitets-reject (flight_full), happy-path
 *   - toggleSignupsClosed: happy-path (steng + gjenåpne)
 *
 * Spørsmålsrekkefølge per action (serverMock → adminMock FIFO):
 *
 * suggestFlightAssignment:
 *   serverMock[0]: auth.getUser
 *   serverMock[1]: users.select(is_admin, email, name).eq.single        (loadRole)
 *   serverMock[2]: games.select(created_by).eq.maybeSingle              (creator-sjekk)
 *   adminMock[0]:  games.select(id, status, game_mode).eq.single
 *   adminMock[1]:  game_players.select(...).eq.order.order.returns
 *   adminMock[2…]: game_players.update({flight_number}).eq.eq (én per aktiv spiller)
 *
 * setPlayerFlight:
 *   serverMock[0..2]: samme som over
 *   adminMock[0]: games.select(id, status, game_mode).eq.single
 *   adminMock[1]: game_players.select({count}).eq.eq.neq.is    (kapasitetssjekk)
 *   adminMock[2]: game_players.update({flight_number}).eq.eq
 *
 * toggleSignupsClosed (admin):
 *   serverMock[0..1]: auth.getUser + users (isAdmin=true → ingen creator-sjekk)
 *   adminMock[0]: games.select(id, status, registration_mode).eq.single
 *   adminMock[1]: games.update({signups_closed_at}).eq
 */

const redirectMock = makeRedirectMock();
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));

const revalidatePathMock = vi.fn();
const revalidateTagMock = vi.fn();
vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
}));

let serverMock: ReturnType<typeof buildSupabaseMock>;
let adminMock: ReturnType<typeof buildSupabaseMock>;

vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => serverMock,
}));

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminMock,
}));

const GAME_ID = 'game-1111-1111-1111-111111111111';
const USER_ID = 'user-2222-2222-2222-222222222222';

/** Sett opp serverMock: autentisert admin-bruker (ingen creator-sjekk). */
function authedAdmin(): void {
  serverMock = buildSupabaseMock([
    { data: { is_admin: true, email: 'admin@example.com', name: 'Admin' }, error: null },
  ]);
  (serverMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { user: { id: USER_ID, email: 'admin@example.com' } },
  });
}

/** Sett opp serverMock: uautentisert. */
function unauthed(): void {
  serverMock = buildSupabaseMock([]);
  (serverMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { user: null },
  });
}

/** Sett opp serverMock: autentisert, men ikke admin og ikke game-creator. */
function authedNonCreator(): void {
  serverMock = buildSupabaseMock([
    { data: { is_admin: false, email: 'player@example.com', name: 'Spiller' }, error: null },
    { data: { created_by: 'someone-else' }, error: null },
  ]);
  (serverMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { user: { id: USER_ID, email: 'player@example.com' } },
  });
}

function lastRedirect(): string | undefined {
  return redirectMock.mock.calls.at(-1)?.[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  serverMock = buildSupabaseMock([]);
  adminMock = buildSupabaseMock([]);
});

// ─── suggestFlightAssignment ────────────────────────────────────────────────

describe('suggestFlightAssignment', () => {
  it('uautentisert → redirect til /login', async () => {
    unauthed();

    const { suggestFlightAssignment } = await import('./flightActions');
    await expect(suggestFlightAssignment(GAME_ID)).rejects.toBeInstanceOf(RedirectError);
    expect(redirectMock).toHaveBeenCalledWith('/login');
  });

  it('ikke-admin og ikke-oppretter → redirect til /', async () => {
    authedNonCreator();

    const { suggestFlightAssignment } = await import('./flightActions');
    await expect(suggestFlightAssignment(GAME_ID)).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/');
  });

  it('happy path: admin foreslår inndeling → skriver flight_number per spiller og redirect til ?status=flight_suggested', async () => {
    authedAdmin();

    // 5 aktive spillere: 4 → flight 1, 1 → flight 2
    const players = Array.from({ length: 5 }, (_, i) => ({
      user_id: `u${i + 1}`,
      flight_number: null,
      withdrawn_at: null,
      created_at: `2026-01-0${i + 1}T00:00:00Z`,
    }));

    adminMock = buildSupabaseMock([
      { data: { id: GAME_ID, status: 'scheduled', game_mode: 'skins' }, error: null }, // games
      { data: players, error: null }, // game_players
      { data: null, error: null }, // update u1
      { data: null, error: null }, // update u2
      { data: null, error: null }, // update u3
      { data: null, error: null }, // update u4
      { data: null, error: null }, // update u5
    ]);

    const { suggestFlightAssignment } = await import('./flightActions');
    await expect(suggestFlightAssignment(GAME_ID)).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe(`/admin/games/${GAME_ID}?status=flight_suggested`);
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, 'max');
  });
});

// ─── setPlayerFlight ─────────────────────────────────────────────────────────

describe('setPlayerFlight', () => {
  it('kapasitetsgrense nådd (4 i target-flight) → redirect til ?error=flight_full', async () => {
    authedAdmin();

    adminMock = buildSupabaseMock([
      { data: { id: GAME_ID, status: 'scheduled', game_mode: 'stableford' }, error: null }, // games
      { data: null, error: null, count: 4 } as { data: null; error: null; count: number }, // count = 4 (full)
    ]);

    const { setPlayerFlight } = await import('./flightActions');
    await expect(setPlayerFlight(GAME_ID, 'target-user', 1)).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe(`/admin/games/${GAME_ID}?error=flight_full`);
  });

  it('happy path: admin setter spiller til ny flight → redirect til ?status=flight_updated', async () => {
    authedAdmin();

    adminMock = buildSupabaseMock([
      { data: { id: GAME_ID, status: 'scheduled', game_mode: 'stableford' }, error: null }, // games
      { data: null, error: null, count: 2 } as { data: null; error: null; count: number }, // count = 2 (har plass)
      { data: null, error: null }, // update
    ]);

    const { setPlayerFlight } = await import('./flightActions');
    await expect(setPlayerFlight(GAME_ID, 'target-user', 2)).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe(`/admin/games/${GAME_ID}?status=flight_updated`);
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, 'max');
  });
});

// ─── toggleSignupsClosed ─────────────────────────────────────────────────────

describe('toggleSignupsClosed', () => {
  it('stenger påmeldingen → redirect til ?status=signups_closed', async () => {
    authedAdmin();

    adminMock = buildSupabaseMock([
      {
        data: { id: GAME_ID, status: 'scheduled', registration_mode: 'open' },
        error: null,
      },
      { data: null, error: null }, // games.update
    ]);

    const { toggleSignupsClosed } = await import('./flightActions');
    await expect(toggleSignupsClosed(GAME_ID, true)).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe(`/admin/games/${GAME_ID}?status=signups_closed`);
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, 'max');
  });

  it('gjenåpner påmeldingen → redirect til ?status=signups_reopened', async () => {
    authedAdmin();

    adminMock = buildSupabaseMock([
      {
        data: {
          id: GAME_ID,
          status: 'scheduled',
          registration_mode: 'manual_approval',
        },
        error: null,
      },
      { data: null, error: null }, // games.update
    ]);

    const { toggleSignupsClosed } = await import('./flightActions');
    await expect(toggleSignupsClosed(GAME_ID, false)).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe(`/admin/games/${GAME_ID}?status=signups_reopened`);
  });

  it('ikke-scheduled spill → redirect til ?error=signups_not_scheduled', async () => {
    authedAdmin();

    adminMock = buildSupabaseMock([
      {
        data: { id: GAME_ID, status: 'active', registration_mode: 'open' },
        error: null,
      },
    ]);

    const { toggleSignupsClosed } = await import('./flightActions');
    await expect(toggleSignupsClosed(GAME_ID, true)).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe(`/admin/games/${GAME_ID}?error=signups_not_scheduled`);
  });
});
