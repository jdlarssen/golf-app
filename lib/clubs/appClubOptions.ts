import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { getClubMemberPlayerOptions } from '@/lib/clubs/getClubMemberPlayerOptions';
import { isClubAdminAnywhere } from '@/lib/clubs/isClubAdminAnywhere';
import { isClubExpired } from '@/lib/clubs/clubStatus';
import {
  buildAppClubOptions,
  type AppClubOptions,
  type AppClubRole,
} from '@/lib/clubs/appClubOptionsView';

/**
 * Everything the app's «Klubb-turnering» needs (#2753): whether the tile shows,
 * the valid clubs you are a member of, and their members.
 *
 * The same lookups the web wizard mounts with (`getOrganiserWizardMountData`):
 * `isClubAdminAnywhere` for the tile, `getClubMemberPlayerOptions` for the
 * members, and your own `group_members` rows for the clubs (the club list in
 * `getNewGameFormData`, read with the admin client here since `api/` has no
 * cookie session). Every query is keyed on the caller's id from the token, so
 * members of clubs you are not in never come back.
 *
 * Best-effort like the web: a failed lookup gives no tile, never an error in
 * the create flow. Only the profile read throws, as the route's 500.
 */
export async function getAppClubOptions(userId: string): Promise<AppClubOptions> {
  const admin = getAdminClient();
  const [profile, ownRows, isClubAdmin, clubMembers] = await Promise.all([
    admin.from('users').select('is_admin').eq('id', userId).maybeSingle(),
    admin
      .from('group_members')
      .select('role, groups(id, name, valid_until)')
      .eq('user_id', userId),
    isClubAdminAnywhere(userId),
    getClubMemberPlayerOptions(userId).catch(() => ({ memberIdsByClub: {}, options: [] })),
  ]);
  if (profile.error) throw new Error(`getAppClubOptions(users): ${profile.error.message}`);
  if (ownRows.error) console.error('[getAppClubOptions] club lookup failed', ownRows.error);

  const clubs = (ownRows.data ?? []).flatMap((row) => {
    const g = row.groups;
    if (!g || isClubExpired(g.valid_until)) return [];
    return [{ id: g.id, name: g.name, role: row.role as AppClubRole }];
  });

  return buildAppClubOptions({
    isAdmin: profile.data?.is_admin === true,
    isClubAdmin,
    clubs,
    memberIdsByClub: clubMembers.memberIdsByClub,
    members: clubMembers.options.map((o) => ({
      id: o.id,
      name: o.name ?? '',
      nickname: o.nickname,
      hcpIndex: o.hcp_index,
      gender: o.gender,
      level: o.level,
      pending: o.pending,
    })),
  });
}
