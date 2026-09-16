import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeLocaleRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

/**
 * Unit-tester for removePlayerFromGame (#1937).
 *
 *   - Cup-kamp + arrangør (ikke admin) → cup_roster_locked, ingen DELETE
 *   - Cup-kamp + global admin → DELETE kjøres
 *   - Vanlig spill før start → DELETE + player_removed
 *   - Aktivt spill → roster_locked, ingen DELETE
 *   - DELETE som treffer 0 rader (RLS nektet) → db_players, ikke player_removed
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

let serverMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => serverMock,
}));

let isAdmin = false;
vi.mock('@/lib/admin/auth', () => ({
  requireAdminOrCreator: async () => ({ userId: CREATOR_ID, isAdmin }),
}));

const CREATOR_ID = '11111111-1111-1111-1111-111111111111';
const GAME_ID = '22222222-2222-2222-2222-222222222222';
const PLAYER_ID = '33333333-3333-3333-3333-333333333333';
const TOURNAMENT_ID = '44444444-4444-4444-4444-444444444444';

function formWith(userId: string): FormData {
  const fd = new FormData();
  fd.set('user_id', userId);
  return fd;
}

async function runRemove(): Promise<string> {
  const { removePlayerFromGame } = await import('./actions');
  const err = await removePlayerFromGame(GAME_ID, formWith(PLAYER_ID)).catch(
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(RedirectError);
  return (err as RedirectError).url;
}

function deleteCalls() {
  return serverMock.__fromCalls.filter(
    (c) => c.table === 'game_players' && c.method === 'delete',
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  isAdmin = false;
});

describe('removePlayerFromGame', () => {
  it('cup-kamp før start + arrangør → cup_roster_locked uten DELETE', async () => {
    serverMock = buildSupabaseMock([
      { data: { status: 'scheduled', tournament_id: TOURNAMENT_ID }, error: null },
    ]);

    const url = await runRemove();

    expect(url).toBe(`/games/${GAME_ID}/spillere?error=cup_roster_locked`);
    expect(deleteCalls()).toHaveLength(0);
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('cup-kamp før start + global admin → DELETE kjøres', async () => {
    isAdmin = true;
    serverMock = buildSupabaseMock([
      { data: { status: 'scheduled', tournament_id: TOURNAMENT_ID }, error: null },
      { data: [{ user_id: PLAYER_ID }], error: null },
    ]);

    const url = await runRemove();

    expect(url).toBe(`/admin/games/${GAME_ID}?status=player_removed`);
    expect(deleteCalls()).toHaveLength(1);
  });

  it('vanlig spill før start → DELETE + player_removed', async () => {
    serverMock = buildSupabaseMock([
      { data: { status: 'draft', tournament_id: null }, error: null },
      { data: [{ user_id: PLAYER_ID }], error: null },
    ]);

    const url = await runRemove();

    expect(url).toBe(`/games/${GAME_ID}/spillere?status=player_removed`);
    expect(deleteCalls()).toHaveLength(1);
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, 'max');
  });

  it('aktivt spill → roster_locked uten DELETE', async () => {
    serverMock = buildSupabaseMock([
      { data: { status: 'active', tournament_id: null }, error: null },
    ]);

    const url = await runRemove();

    expect(url).toBe(`/games/${GAME_ID}/spillere?error=roster_locked`);
    expect(deleteCalls()).toHaveLength(0);
  });

  it('DELETE som treffer 0 rader → db_players, ikke player_removed', async () => {
    serverMock = buildSupabaseMock([
      { data: { status: 'scheduled', tournament_id: null }, error: null },
      { data: [], error: null },
    ]);

    const url = await runRemove();

    expect(url).toBe(`/games/${GAME_ID}/spillere?error=db_players`);
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });
});
