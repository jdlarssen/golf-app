import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeLocaleRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';
import type { LeagueJoinContext } from '@/lib/league/getLeagueJoinContext';

/**
 * Unit tests for joinLeagueByCode (#2662), the join through the shareable
 * league link.
 *
 * `getLeagueJoinContext` is mocked at the boundary, as the cup link's test
 * mocks `getCupJoinContext`: the read is covered by its own test, the decision
 * it feeds by `joinValidation.test.ts`. Here: the action writes nothing before
 * the guard says yes (a hand-built POST is refused the same way the page
 * refuses), the write is the player's own confirmed row, and a read error is a
 * refusal, not a guess.
 */

const redirectMock = makeLocaleRedirectMock();
vi.mock('@/i18n/navigation', () => ({
  redirect: (arg: { href: string; locale?: string }) => redirectMock(arg),
}));
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'no',
}));
vi.mock('@/lib/i18n/revalidateLocalePath', () => ({
  revalidatePath: vi.fn(),
}));

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => supabaseMock,
}));

let adminMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminMock,
}));

const contextMock = vi.fn();
vi.mock('@/lib/league/getLeagueJoinContext', () => ({
  getLeagueJoinContext: (...args: unknown[]) => contextMock(...args),
}));

import { joinLeagueByCode } from './actions';

const ME = 'player-1';
const CODE = 'abcd2345';

function setUser(id: string | null) {
  (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { user: id ? { id, email: `${id}@x.no` } : null },
  });
}

/** An open draft league `ME` can join. Overrides break one thing. */
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

function form(code = CODE): FormData {
  const fd = new FormData();
  fd.set('code', code);
  return fd;
}

function upserts() {
  return adminMock.__fromCalls.filter((c) => c.method === 'upsert');
}

beforeEach(() => {
  vi.clearAllMocks();
  supabaseMock = buildSupabaseMock([]);
  adminMock = buildSupabaseMock([{ error: null }]);
  setUser(ME);
});

describe('joinLeagueByCode', () => {
  it('writes the own row, confirmed, and lands on the league', async () => {
    contextMock.mockResolvedValue(context());

    await expect(joinLeagueByCode(form())).rejects.toBeInstanceOf(RedirectError);

    const [upsert] = upserts();
    expect(upsert.table).toBe('league_players');
    const row = upsert.args[0] as { league_id: string; user_id: string; accepted_at: string };
    expect(row).toMatchObject({ league_id: 'league-1', user_id: ME });
    expect(Number.isNaN(Date.parse(row.accepted_at))).toBe(false);
    expect(upsert.args[1]).toEqual({ onConflict: 'league_id,user_id', ignoreDuplicates: true });
    expect(redirectMock).toHaveBeenCalledWith({ href: '/liga/league-1?status=joined', locale: 'no' });
  });

  it('no session → the login, which comes back to the link', async () => {
    setUser(null);

    await expect(joinLeagueByCode(form())).rejects.toBeInstanceOf(RedirectError);

    expect(redirectMock).toHaveBeenCalledWith({ href: `/login?next=/liga/bli-med/${CODE}`, locale: 'no' });
    expect(contextMock).not.toHaveBeenCalled();
    expect(upserts()).toHaveLength(0);
  });

  it.each<[string, Partial<LeagueJoinContext['facts']>, string]>([
    ['an unknown or switched-off link', { leagueExists: false }, 'not_found'],
    ['a finished league', { status: 'finished' }, 'closed'],
    ['no handicap on the profile', { profileCompleted: false }, 'profile_incomplete'],
  ])('a hand-built POST for %s is refused without writing', async (_label, facts, error) => {
    contextMock.mockResolvedValue(context(facts));

    expect(await joinLeagueByCode(form())).toEqual({ error });
    expect(upserts()).toHaveLength(0);
  });

  it('already in → straight to the league, no write', async () => {
    contextMock.mockResolvedValue(context({ alreadyJoined: true }));

    await expect(joinLeagueByCode(form())).rejects.toBeInstanceOf(RedirectError);

    expect(redirectMock).toHaveBeenCalledWith({ href: '/liga/league-1', locale: 'no' });
    expect(upserts()).toHaveLength(0);
  });

  it('a failed read is a refusal, never a write on a guess (#1863)', async () => {
    contextMock.mockRejectedValue(new Error('getLeagueJoinContext: players read failed'));

    expect(await joinLeagueByCode(form())).toEqual({ error: 'read_failed' });
    expect(upserts()).toHaveLength(0);
  });

  it('a failed write says so', async () => {
    contextMock.mockResolvedValue(context());
    adminMock = buildSupabaseMock([{ error: { message: 'boom' } }]);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await joinLeagueByCode(form())).toEqual({ error: 'save_failed' });
    errorSpy.mockRestore();
  });

  it('an empty code never reaches the read', async () => {
    expect(await joinLeagueByCode(form(''))).toEqual({ error: 'not_found' });
    expect(contextMock).not.toHaveBeenCalled();
  });
});
