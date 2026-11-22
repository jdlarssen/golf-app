import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { selectAllRows } from '@/lib/supabase/selectAllRows';
import { playerName } from '@/lib/names/playerName';

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
 * Audit 2026-11-20: a failed read throws (the page shows its error screen),
 * never «no clubs» or «0 members». The members are read in pages, past
 * PostgREST's 1 000-row cap.
 *
 * Part of #50 (Klubb-eierskap, delegering & tilgangsstyring).
 */
export async function getAllClubsForAdmin(): Promise<AdminClubRow[]> {
  const admin = getAdminClient();

  const [groupsRes, allMembers] = await Promise.all([
    admin
      .from('groups')
      .select('id, name, short_id, member_cap, valid_until')
      .order('name', { ascending: true }),
    selectAllRows(
      (from, to) =>
        admin
          .from('group_members')
          .select('group_id, role, user_id, users(name, nickname)')
          .order('group_id')
          .order('user_id')
          .range(from, to),
      'getAllClubsForAdmin members',
    ),
  ]);

  if (groupsRes.error) throw groupsRes.error;
  const groups = groupsRes.data ?? [];

  // Aggregate per group
  return groups
    .map((g) => {
      const groupMembers = allMembers.filter((m) => m.group_id === g.id);

      const ownerNames = groupMembers
        .filter((m) => m.role === 'owner')
        .map((m) => {
          const user = m.users;
          return playerName(user) ?? 'Ukjent';
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
