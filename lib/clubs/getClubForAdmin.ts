import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { type ClubMember } from './getClubDetail';

const ROLE_ORDER: Record<'owner' | 'admin' | 'member', number> = {
  owner: 0,
  admin: 1,
  member: 2,
};

export type AdminClubDetail = {
  club: {
    id: string;
    name: string;
    short_id: string;
    member_cap: number | null;
    valid_until: string | null;
  };
  members: ClubMember[];
};

/**
 * Returns club detail for the admin governance surface (/admin/klubber/[id]).
 *
 * Uses getAdminClient() — no membership gate, admin can view any club.
 * Returns null if the club doesn't exist.
 *
 * Reuses ClubMember type + sort + name-normalisation from getClubDetail.ts.
 *
 * Part of #50 (Klubb-eierskap, delegering & tilgangsstyring).
 */
export async function getClubForAdmin(clubId: string): Promise<AdminClubDetail | null> {
  const admin = getAdminClient();

  const [clubRes, membersRes] = await Promise.all([
    admin
      .from('groups')
      .select('id, name, short_id, member_cap, valid_until')
      .eq('id', clubId)
      .maybeSingle(),
    admin
      .from('group_members')
      .select('user_id, role, joined_at, users(name, nickname)')
      .eq('group_id', clubId),
  ]);

  if (!clubRes.data) return null;

  const raw = clubRes.data;

  const members: ClubMember[] = (membersRes.data ?? [])
    .map((row) => {
      const usersRaw = row.users as unknown as
        | { name: string | null; nickname: string | null }
        | { name: string | null; nickname: string | null }[]
        | null;
      const user = Array.isArray(usersRaw) ? (usersRaw[0] ?? null) : usersRaw;
      const displayName =
        user?.nickname?.trim() || user?.name?.trim() || 'Ukjent';

      return {
        userId: row.user_id as string,
        name: displayName,
        role: row.role as 'owner' | 'admin' | 'member',
        joinedAt: row.joined_at as string,
      };
    })
    .sort((a, b) => {
      const roleDiff = ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
      if (roleDiff !== 0) return roleDiff;
      return a.name.localeCompare(b.name, 'nb');
    });

  return {
    club: {
      id: raw.id,
      name: raw.name,
      short_id: raw.short_id,
      member_cap: raw.member_cap ?? null,
      valid_until: raw.valid_until ?? null,
    },
    members,
  };
}
