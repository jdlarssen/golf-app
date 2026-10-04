import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';
import { getOnboardingGame } from './getOnboardingGame';

/**
 * #2350: the game card on «Fullfør profilen». Read with the request client,
 * so RLS only lets the player's own row through; the open-rule
 * (`isOnboardingGameOpen`) decides whether the round still waits for them.
 * Anything else — no row, an error, a withdrawn player, a finished round —
 * gives no card, and the page renders without it.
 */

const GAME_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const USER_ID = 'u-1';

function row(
  overrides: { withdrawn_at?: string | null; status?: string; source_game_id?: string | null } = {},
) {
  return {
    data: {
      withdrawn_at: overrides.withdrawn_at ?? null,
      games: {
        id: GAME_ID,
        name: 'Lørdagsrunden',
        status: overrides.status ?? 'scheduled',
        game_mode: 'stableford',
        mode_config: { kind: 'stableford', team_size: 1 },
        scheduled_tee_off_at: '2026-10-04T07:20:00Z',
        source_game_id: overrides.source_game_id ?? null,
        courses: { name: 'Byneset' },
      },
    },
    error: null,
  };
}

type Client = Parameters<typeof getOnboardingGame>[0];

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('getOnboardingGame', () => {
  it('maps a scheduled game to the card fields', async () => {
    const supabase = buildSupabaseMock([row()], {}, { strictSingle: true });

    const game = await getOnboardingGame(supabase as unknown as Client, USER_ID, GAME_ID);

    expect(game).toEqual({
      gameId: GAME_ID,
      name: 'Lørdagsrunden',
      courseName: 'Byneset',
      teeOffAt: '2026-10-04T07:20:00Z',
      gameMode: 'stableford',
      modeConfig: { kind: 'stableford', team_size: 1 },
    });
    expect(supabase.__fromCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: 'game_players', method: 'eq', args: ['game_id', GAME_ID] }),
        expect.objectContaining({ table: 'game_players', method: 'eq', args: ['user_id', USER_ID] }),
      ]),
    );
  });

  it('no row (not on the game) gives null', async () => {
    const supabase = buildSupabaseMock([{ data: null, error: null }], {}, { strictSingle: true });

    expect(await getOnboardingGame(supabase as unknown as Client, USER_ID, GAME_ID)).toBeNull();
  });

  it('a query error gives null and a log line', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const supabase = buildSupabaseMock([{ data: null, error: { message: 'boom' } }]);

    expect(await getOnboardingGame(supabase as unknown as Client, USER_ID, GAME_ID)).toBeNull();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('[complete-profile]'), 'boom');
  });

  it('a withdrawn player gives null', async () => {
    const supabase = buildSupabaseMock([row({ withdrawn_at: '2026-10-01T10:00:00Z' })]);

    expect(await getOnboardingGame(supabase as unknown as Client, USER_ID, GAME_ID)).toBeNull();
  });

  it('a finished game gives null', async () => {
    const supabase = buildSupabaseMock([row({ status: 'finished' })]);

    expect(await getOnboardingGame(supabase as unknown as Client, USER_ID, GAME_ID)).toBeNull();
  });
});
