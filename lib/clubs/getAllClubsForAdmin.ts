import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';

export type AdminClubRow = {
  id: string;
  name: string;
  short_id: string;
  member_cap: number | null;
  valid_until: string | null;
  memberCount: number;
  ownerNames: string[];
};

/**
 * Returns all clubs for the admin governance surface (/admin/klubber).
 *
 * Uses getAdminClient() so admins can see clubs they are not a member of.
 *
 * Fetches all groups + all group_members in two queries, then aggregates
 * member counts + owner names in JS to avoid N+1.
 *
 * Part of #50 (Klubb-eierskap, delegering & tilgangsstyring).
 */
export async function getAllClubsForAdmin(): Promise<AdminClubRow[]> {
  const admin = getAdminClient();

  const [groupsRes, membersRes] = await Promise.all([
    admin
      .from('groups')
      .select('id, name, short_id, member_cap, valid_until')
      .order('name', { ascending: true }),
    admin
      .from('group_members')
      .select('group_id, role, user_id, users(name, nickname)'),
  ]);

  const groups = groupsRes.data ?? [];
  const allMembers = membersRes.data ?? [];

  // Aggregate per group
  return groups
    .map((g) => {
      const groupMembers = allMembers.filter((m) => m.group_id === g.id);

      const ownerNames = groupMembers
        .filter((m) => m.role === 'owner')
        .map((m) => {
          const usersRaw = m.users as unknown as
            | { name: string | null; nickname: string | null }
            | { name: string | null; nickname: string | null }[]
            | null;
          const user = Array.isArray(usersRaw) ? (usersRaw[0] ?? null) : usersRaw;
          return user?.nickname?.trim() || user?.name?.trim() || 'Ukjent';
        });

      return {
        id: g.id,
        name: g.name,
        short_id: g.short_id,
        member_cap: g.member_cap ?? null,
        valid_until: g.valid_until ?? null,
        memberCount: groupMembers.length,
        ownerNames,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'nb'));
}
