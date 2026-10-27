'use server';

import 'server-only';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrClubAdminOfLeague } from '@/lib/admin/auth';
import { expectAffected } from '@/lib/supabase/affectedRows';
import { writeWithFreshJoinCode } from './joinCode';

export type LeagueJoinLinkMode = 'on' | 'off' | 'rotate';

export type LeagueJoinLinkResult =
  | { joinCode: string | null }
  | { error: 'club_league' | 'save_failed' };

/**
 * The organiser's switch for a league's shareable link (#2662). Mirrors
 * `setLeagueEmbed` (`./spectate.ts`):
 *
 * - `on`: keeps a code that is already set (links already shared keep working),
 *   otherwise draws a new one. Returns the code.
 * - `off`: sets `join_code` to null. Every shared link gives 404. Returns null.
 * - `rotate`: draws a new code. The old link dies, the new one works.
 *
 * Only for a league without a club: a club league's members join through
 * `join_club_league`, and the membership is the gate there. The gate is
 * `requireAdminOrClubAdminOfLeague`, the write runs on the caller's client under
 * «leagues admin or club-admin update» (0092), and `expectAffected` turns a
 * silent 0-row write into a failure (AGENTS.md trap 2).
 */
export async function setLeagueJoinLink(
  leagueId: string,
  mode: LeagueJoinLinkMode,
): Promise<LeagueJoinLinkResult> {
  const supabase = await getServerClient();
  // Outside the try: a refused caller is redirected, and NEXT_REDIRECT must
  // not be swallowed.
  const { groupId } = await requireAdminOrClubAdminOfLeague(supabase, leagueId);
  if (groupId) return { error: 'club_league' };

  try {
    if (mode === 'on') {
      const { data: current, error } = await supabase
        .from('leagues')
        .select('join_code')
        .eq('id', leagueId)
        .maybeSingle();
      if (error) throw new Error(`setLeagueJoinLink:read: ${error.message}`);
      if (current?.join_code) return { joinCode: current.join_code };
    }

    let joinCode: string | null = null;
    if (mode === 'off') {
      expectAffected(
        await supabase.from('leagues').update({ join_code: null }).eq('id', leagueId).select('id'),
        'setLeagueJoinLink:off',
      );
    } else {
      const [row] = expectAffected(
        await writeWithFreshJoinCode((code) =>
          supabase.from('leagues').update({ join_code: code }).eq('id', leagueId).select('join_code'),
        ),
        `setLeagueJoinLink:${mode}`,
      );
      joinCode = row.join_code;
    }

    revalidatePath(`/admin/liga/${leagueId}`);
    // «Del ligaen» on the league page follows the code.
    revalidatePath(`/liga/${leagueId}`);
    return { joinCode };
  } catch (err) {
    console.error('[setLeagueJoinLink] failed', { leagueId, mode, err });
    return { error: 'save_failed' };
  }
}
