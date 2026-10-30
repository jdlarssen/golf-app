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
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, { expire: 0 });
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

// #2569 — forfall før start i et lag-format. Etter fjerningen leses laget på
// nytt, og statusen sier hva som skjedde: laget spiller kortere (lovlig, med
// handicapet regnet for de som er igjen), eller laget har for få og må fylles
// før runden kan starte.
describe('removePlayerFromGame — laget etter forfallet (#2569)', () => {
  const TEXAS_AT_4 = {
    kind: 'texas_scramble',
    team_size: 4,
    teams_count: 3,
    team_handicap_pct: 20,
  };
  const remaining = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ user_id: `left-${i}` }));

  it('Texas à 4: laget går fra 4 til 3 → player_removed_team_short med lag og antall', async () => {
    serverMock = buildSupabaseMock([
      {
        data: { status: 'scheduled', tournament_id: null, game_mode: 'texas_scramble', mode_config: TEXAS_AT_4 },
        error: null,
      },
      { data: [{ user_id: PLAYER_ID, team_number: 2 }], error: null },
      { data: remaining(3), error: null },
    ]);

    const url = await runRemove();

    expect(url).toBe(`/games/${GAME_ID}/spillere?status=player_removed_team_short&team=2&count=3`);
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, { expire: 0 });
  });

  it('Texas à 4: laget går fra 3 til 2 → player_removed_team_uneven', async () => {
    serverMock = buildSupabaseMock([
      {
        data: { status: 'scheduled', tournament_id: null, game_mode: 'texas_scramble', mode_config: TEXAS_AT_4 },
        error: null,
      },
      { data: [{ user_id: PLAYER_ID, team_number: 2 }], error: null },
      { data: remaining(2), error: null },
    ]);

    expect(await runRemove()).toBe(
      `/games/${GAME_ID}/spillere?status=player_removed_team_uneven&team=2&count=2&missing=1`,
    );
  });

  it('shamble à 4: laget på 3 teller sine beste → player_removed_team_short_shamble', async () => {
    serverMock = buildSupabaseMock([
      {
        data: {
          status: 'scheduled',
          tournament_id: null,
          game_mode: 'shamble',
          mode_config: {
            kind: 'shamble',
            team_size: 4,
            teams_count: 2,
            shamble_variant: 'shamble',
            shamble_count: 2,
            shamble_scoring: 'net',
          },
        },
        error: null,
      },
      { data: [{ user_id: PLAYER_ID, team_number: 1 }], error: null },
      { data: remaining(3), error: null },
    ]);

    expect(await runRemove()).toBe(
      `/games/${GAME_ID}/spillere?status=player_removed_team_short_shamble&team=1&count=3`,
    );
  });

  it('best ball: paret står igjen med én → player_removed_team_uneven', async () => {
    serverMock = buildSupabaseMock([
      {
        data: {
          status: 'scheduled',
          tournament_id: null,
          game_mode: 'best_ball',
          mode_config: { kind: 'best_ball', team_size: 2, teams_count: 2 },
        },
        error: null,
      },
      { data: [{ user_id: PLAYER_ID, team_number: 2 }], error: null },
      { data: remaining(1), error: null },
    ]);

    expect(await runRemove()).toBe(
      `/games/${GAME_ID}/spillere?status=player_removed_team_uneven&team=2&count=1&missing=1`,
    );
  });

  it('Texas à 4: laget går fra 2 til 1 → det mangler to (missing=2)', async () => {
    serverMock = buildSupabaseMock([
      {
        data: { status: 'scheduled', tournament_id: null, game_mode: 'texas_scramble', mode_config: TEXAS_AT_4 },
        error: null,
      },
      { data: [{ user_id: PLAYER_ID, team_number: 2 }], error: null },
      { data: remaining(1), error: null },
    ]);

    expect(await runRemove()).toBe(
      `/games/${GAME_ID}/spillere?status=player_removed_team_uneven&team=2&count=1&missing=2`,
    );
  });

  it('laget blir tomt → vanlig player_removed', async () => {
    serverMock = buildSupabaseMock([
      {
        data: { status: 'scheduled', tournament_id: null, game_mode: 'texas_scramble', mode_config: TEXAS_AT_4 },
        error: null,
      },
      { data: [{ user_id: PLAYER_ID, team_number: 3 }], error: null },
      { data: [], error: null },
    ]);

    expect(await runRemove()).toBe(`/games/${GAME_ID}/spillere?status=player_removed`);
  });

  it('solo-format → vanlig player_removed, og laget leses ikke', async () => {
    serverMock = buildSupabaseMock([
      {
        data: {
          status: 'scheduled',
          tournament_id: null,
          game_mode: 'stableford',
          mode_config: { kind: 'stableford', team_size: 1, points_table: 'standard' },
        },
        error: null,
      },
      { data: [{ user_id: PLAYER_ID, team_number: null }], error: null },
    ]);

    expect(await runRemove()).toBe(`/games/${GAME_ID}/spillere?status=player_removed`);
    expect(
      serverMock.__fromCalls.filter((c) => c.table === 'game_players' && c.method === 'select'),
    ).toHaveLength(1);
  });

  it('lesingen av laget feiler → vanlig player_removed (fjerningen står)', async () => {
    serverMock = buildSupabaseMock([
      {
        data: { status: 'scheduled', tournament_id: null, game_mode: 'texas_scramble', mode_config: TEXAS_AT_4 },
        error: null,
      },
      { data: [{ user_id: PLAYER_ID, team_number: 2 }], error: null },
      { data: null, error: { message: 'boom' } },
    ]);

    expect(await runRemove()).toBe(`/games/${GAME_ID}/spillere?status=player_removed`);
  });
});
