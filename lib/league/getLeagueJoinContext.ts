import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { isJoinCode } from './joinCode';
import type { LeagueJoinFacts } from './joinValidation';

/**
 * Gathers the facts `evaluateLeagueJoin` needs for one visitor and one league
 * link (#2662), plus what the link page shows about the league.
 *
 * Shared by BOTH call sites: the page (`/liga/bli-med/[code]`), which picks
 * what to render, and the server action, which refuses before it writes. One
 * home for the read means the button can never show on grounds the action does
 * not recognise (AGENTS.md trap 4). Mirrors `getCupJoinContext` (#1490).
 *
 * Read with the service role: a stranger is not logged in at all, and the page
 * shows the league before the login. Authorisation sits in the decision, not in
 * the read access. A read error is an error, never an empty list (#1863): it
 * is thrown, the page lets it reach `bli-med/error.tsx` (Try again), and the
 * action turns it into `read_failed`.
 */

export type LeagueJoinLeague = {
  id: string;
  name: string;
  status: string;
  format: string;
  is_simulator: boolean;
  group_id: string | null;
  courses: { name: string | null } | null;
};

export type LeagueJoinRound = {
  sequence: number;
  opensAt: string;
  closesAt: string;
};

export type LeagueJoinContext = {
  league: LeagueJoinLeague | null;
  /** In sequence order. */
  rounds: LeagueJoinRound[];
  /** How many are in the league now. The page shows the number, never names. */
  participantCount: number;
  facts: LeagueJoinFacts;
};

function missing(signedIn: boolean): LeagueJoinContext {
  return {
    league: null,
    rounds: [],
    participantCount: 0,
    facts: { leagueExists: false, status: null, signedIn, profileCompleted: false, alreadyJoined: false },
  };
}

function failRead(which: string, code: string, error: unknown): never {
  console.error('[liga] getLeagueJoinContext read failed', { code, which, error });
  throw new Error(`getLeagueJoinContext: ${which} read failed`);
}

export async function getLeagueJoinContext(
  code: string,
  userId: string | null,
): Promise<LeagueJoinContext> {
  const signedIn = userId !== null;
  // Cheap guard: a code of the wrong shape never reaches the DB.
  if (!isJoinCode(code)) return missing(signedIn);

  const admin = getAdminClient();
  const { data: league, error: leagueError } = await admin
    .from('leagues')
    .select('id, name, status, format, is_simulator, group_id, courses!leagues_course_id_fkey(name)')
    .eq('join_code', code)
    .maybeSingle<LeagueJoinLeague>();

  // A read error is not «no such league»: without this a Supabase hiccup
  // became a 404 for a link that works.
  if (leagueError) failRead('league', code, leagueError);
  // A club league never has a code; if one got there by hand, the link still
  // leads nowhere (its members join through join_club_league).
  if (!league || league.group_id !== null) return missing(signedIn);

  const [roundsRes, playersRes, meRes] = await Promise.all([
    admin
      .from('league_rounds')
      .select('sequence, opens_at, closes_at')
      .eq('league_id', league.id)
      .order('sequence', { ascending: true }),
    admin.from('league_players').select('user_id').eq('league_id', league.id),
    userId
      ? admin
          .from('users')
          .select('profile_completed_at')
          .eq('id', userId)
          .maybeSingle<{ profile_completed_at: string | null }>()
      : // `error: null` keeps `.error` on the union so the check below compiles.
        Promise.resolve({ data: null, error: null }),
  ]);

  if (roundsRes.error) failRead('rounds', code, roundsRes.error);
  if (playersRes.error) failRead('players', code, playersRes.error);
  if (meRes.error) failRead('me', code, meRes.error);

  const playerIds = new Set((playersRes.data ?? []).map((r) => r.user_id as string));

  return {
    league,
    rounds: (roundsRes.data ?? []).map((r) => ({
      sequence: r.sequence as number,
      opensAt: r.opens_at as string,
      closesAt: r.closes_at as string,
    })),
    participantCount: playerIds.size,
    facts: {
      leagueExists: true,
      status: league.status,
      signedIn,
      profileCompleted: meRes.data?.profile_completed_at != null,
      alreadyJoined: userId !== null && playerIds.has(userId),
    },
  };
}
