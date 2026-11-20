import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

export type LeagueViewAccess = {
  allowed: boolean;
  /**
   * The caller is a member of the league's club. Only read when the caller is
   * not a participant (the self-service «Bli med» needs it); false otherwise.
   */
  isClubMember: boolean;
};

/**
 * Who may see a league (#480), one home for the web page and the app route
 * (#2638, AGENTS.md trap 4). Both read the league with the admin client, so
 * this gate, not RLS, is what hides a club league from outsiders:
 *
 *  - a standalone league (`groupId` null): every signed-in user, as before;
 *  - a club league: its participants, the club's members and global admins.
 *
 * `supabase` reads as the caller (the web's cookie client or the app's
 * caller-scoped client): the caller's own `group_members` row and their own
 * `users.is_admin`. A failed read throws: never a silent pass, and never a
 * «not found» either, so the web shows its error page and the app route
 * answers 500 `load_failed` instead of 404.
 */
export async function canViewLeague(
  supabase: SupabaseClient<Database>,
  input: { groupId: string | null; userId: string | null; isParticipant: boolean },
): Promise<LeagueViewAccess> {
  const { groupId, userId, isParticipant } = input;
  if (!groupId || isParticipant) return { allowed: true, isClubMember: false };
  if (!userId) return { allowed: false, isClubMember: false };

  const [membership, profile] = await Promise.all([
    supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .maybeSingle(),
    supabase.from('users').select('is_admin').eq('id', userId).maybeSingle(),
  ]);
  if (membership.error || profile.error) {
    console.error('[league] canViewLeague read failed', {
      groupId,
      membershipError: membership.error,
      profileError: profile.error,
    });
    throw new Error('canViewLeague: the access read failed');
  }
  const isClubMember = membership.data !== null;
  return { allowed: isClubMember || profile.data?.is_admin === true, isClubMember };
}

/**
 * Who may open the card behind a cell in the season table (owner decision,
 * audit 2026-11-20): the league's participants, and the ones who run it — its
 * creator, an owner or admin of its club, and global admins. Narrower than
 * `canViewLeague`: seeing the table is not seeing every hole.
 *
 * One home for the three callers: the card's gate (`leagueCardAccess`), the
 * web page (which only links a cell for a caller who may open it) and the
 * app's league route (which only sends the flight behind a cell to such a
 * caller). `supabase` reads as the caller, like `canViewLeague`: the caller's
 * own `users.is_admin` and own `group_members` row. A failed read throws.
 */
export async function canOpenLeagueCards(
  supabase: SupabaseClient<Database>,
  input: {
    groupId: string | null;
    createdBy: string | null;
    userId: string | null;
    isParticipant: boolean;
  },
): Promise<boolean> {
  const { groupId, createdBy, userId, isParticipant } = input;
  if (!userId) return false;
  if (isParticipant || createdBy === userId) return true;

  const [profile, membership] = await Promise.all([
    supabase.from('users').select('is_admin').eq('id', userId).maybeSingle(),
    groupId
      ? supabase
          .from('group_members')
          .select('role')
          .eq('group_id', groupId)
          .eq('user_id', userId)
          .maybeSingle()
      : // `error: null` keeps the union's `.error` readable below.
        Promise.resolve({ data: null, error: null }),
  ]);
  if (profile.error || membership.error) {
    console.error('[league] canOpenLeagueCards read failed', {
      groupId,
      profileError: profile.error,
      membershipError: membership.error,
    });
    throw new Error('canOpenLeagueCards: the access read failed');
  }
  if (profile.data?.is_admin === true) return true;
  const role = membership.data?.role;
  return role === 'owner' || role === 'admin';
}
