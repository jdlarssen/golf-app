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
