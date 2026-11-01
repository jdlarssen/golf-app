import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';
import type { LeagueJoinContext } from './getLeagueJoinContext';

/**
 * Type A (#2748): the one write behind the league link, shared by the web
 * action and the app's route. The read (`getLeagueJoinContext`) and the
 * decision (`joinValidation.test.ts`) have their own suites. Here: nothing is
 * written before the guard says yes, the write is the caller's own confirmed
 * row, and the answers carry what each caller needs.
 */

vi.mock('@/lib/i18n/revalidateLocalePath', () => ({ revalidatePath: vi.fn() }));
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';

let adminMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => adminMock }));

const contextMock = vi.fn();
vi.mock('./getLeagueJoinContext', () => ({
  getLeagueJoinContext: (...args: unknown[]) => contextMock(...args),
}));

import { joinLeagueByCodeCore } from './joinLeagueByCode';

const ME = 'player-1';
const CODE = 'abcd2345';

function context(facts: Partial<LeagueJoinContext['facts']> = {}): LeagueJoinContext {
  return {
    league: {
      id: 'league-1',
      name: 'Vinterliga',
      status: 'draft',
      format: 'stableford',
      is_simulator: true,
      group_id: null,
      courses: null,
    },
    rounds: [],
    participantCount: 3,
    facts: {
      leagueExists: true,
      status: 'draft',
      signedIn: true,
      profileCompleted: true,
      alreadyJoined: false,
      ...facts,
    },
  };
}

const upserts = () => adminMock.__fromCalls.filter((c) => c.method === 'upsert');

beforeEach(() => {
  vi.clearAllMocks();
  adminMock = buildSupabaseMock([{ error: null }]);
});

describe('joinLeagueByCodeCore', () => {
  it('writes the caller as a confirmed player, and clears the pages that show the list', async () => {
    contextMock.mockResolvedValue(context());

    expect(await joinLeagueByCodeCore(CODE, ME)).toEqual({ ok: true, leagueId: 'league-1', alreadyJoined: false });

    expect(contextMock).toHaveBeenCalledWith(CODE, ME);
    const [upsert] = upserts();
    expect(upsert.table).toBe('league_players');
    const row = upsert.args[0] as { league_id: string; user_id: string; accepted_at: string };
    expect(row).toMatchObject({ league_id: 'league-1', user_id: ME });
    expect(Number.isNaN(Date.parse(row.accepted_at))).toBe(false);
    expect(upsert.args[1]).toEqual({ onConflict: 'league_id,user_id', ignoreDuplicates: true });
    expect(revalidatePath).toHaveBeenCalledWith('/liga/league-1');
    expect(revalidatePath).toHaveBeenCalledWith('/admin/liga/league-1');
  });

  it('someone already in gets the league back, and nothing is written', async () => {
    contextMock.mockResolvedValue(context({ alreadyJoined: true }));

    expect(await joinLeagueByCodeCore(CODE, ME)).toEqual({ ok: true, leagueId: 'league-1', alreadyJoined: true });
    expect(upserts()).toHaveLength(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each<[string, Partial<LeagueJoinContext['facts']>, string]>([
    ['an unknown or switched-off link', { leagueExists: false }, 'not_found'],
    ['a finished league', { status: 'finished' }, 'closed'],
    ['no handicap on the profile', { profileCompleted: false }, 'profile_incomplete'],
  ])('%s is refused without writing', async (_label, facts, error) => {
    contextMock.mockResolvedValue(context(facts));

    expect(await joinLeagueByCodeCore(CODE, ME)).toEqual({ ok: false, error });
    expect(upserts()).toHaveLength(0);
  });

  it('a failed read is a refusal, never a write on a guess (#1863)', async () => {
    contextMock.mockRejectedValue(new Error('getLeagueJoinContext: players read failed'));

    expect(await joinLeagueByCodeCore(CODE, ME)).toEqual({ ok: false, error: 'read_failed' });
    expect(upserts()).toHaveLength(0);
  });

  it('a failed write says so, and clears nothing', async () => {
    contextMock.mockResolvedValue(context());
    adminMock = buildSupabaseMock([{ error: { message: 'boom' } }]);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await joinLeagueByCodeCore(CODE, ME)).toEqual({ ok: false, error: 'save_failed' });
    expect(revalidatePath).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
