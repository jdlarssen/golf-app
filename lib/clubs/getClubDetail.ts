import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAdminClient } from '@/lib/supabase/admin';

export type ClubMember = {
  userId: string;
  name: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
};

export type PendingJoinRequest = {
  id: string;
  requesterName: string;
  requestedAt: string;
};

export type PendingClubInvitation = {
  id: string;
  email: string;
  invitedAt: string;
};

export type ClubDetail = {
  club: {
    id: string;
    name: string;
    short_id: string;
    member_cap: number | null;
    valid_until: string | null;
  };
  members: ClubMember[];
  myRole: 'owner' | 'admin' | 'member';
  /** Pending join requests — populated only when caller is owner/admin; [] for members. */
  pendingRequests: PendingJoinRequest[];
  /** Pending email invitations (#644) — populated only for owner/admin; [] for members. */
  pendingInvitations: PendingClubInvitation[];
};

const ROLE_ORDER: Record<'owner' | 'admin' | 'member', number> = {
  owner: 0,
  admin: 1,
  member: 2,
};

/**
 * Returns club detail for the given caller, or null if the caller is not a
 * member (or the club doesn't exist).
 *
 * Auth strategy:
 *   1. Use the request-scoped client to verify the caller is a member of the
 *      club (RLS restricts group_members to the caller's own rows + co-members
 *      via is_group_member). A non-member gets 0 rows → return null.
 *   2. Once membership is established, use the admin client to fetch all
 *      member rows joined to users(name, nickname) — the users table RLS only
 *      lets a user read their own row + co-players in shared games, so fellow
 *      club member names are not readable via the request-scoped client.
 *
 * Mirrors the pattern in lib/games/getDiscoverableGames.ts (admin-client after
 * authz is established in code).
 *
 * Members are sorted: owner → admin → member, then alphabetically by name.
 *
 * Part of #442 (Opprett klubb — eierskap + klubb-scoped oppdagbarhet).
 */
export async function getClubDetail(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  clubId: string,
  userId: string,
): Promise<ClubDetail | null> {
  // Step 1 — verify caller is a member via request-scoped client (RLS-gated).
  const { data: myMembership } = await supabase
    .from('group_members')
    .select('role')
    .eq('group_id', clubId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!myMembership) return null;

  const myRole = myMembership.role as 'owner' | 'admin' | 'member';

  // Step 2 — fetch all data via admin client (bypasses users-table RLS).
  const admin = getAdminClient();

  const isAdmin = myRole === 'owner' || myRole === 'admin';

  const [clubRes, membersRes, requestsRes, invitationsRes] = await Promise.all([
    admin
      .from('groups')
      .select('id, name, short_id, member_cap, valid_until')
      .eq('id', clubId)
      .maybeSingle(),
    admin
      .from('group_members')
      .select('user_id, role, joined_at, users(name, nickname)')
      .eq('group_id', clubId),
    // Pending requests are only fetched for owner/admin — members get [].
    isAdmin
      ? admin
          .from('group_join_requests')
          .select('id, created_at, user_id, users(name, nickname)')
          .eq('group_id', clubId)
          .eq('status', 'pending')
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    // #644: open email invitations — owner/admin only. Open = not accepted.
    isAdmin
      ? admin
          .from('club_invitations')
          .select('id, email, created_at')
          .eq('group_id', clubId)
          .is('accepted_at', null)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (!clubRes.data) return null;

  const members: ClubMember[] = (membersRes.data ?? [])
    .map((row) => {
      // Supabase types the FK join as array even for one-to-one — normalise.
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

  const pendingRequests: PendingJoinRequest[] = (requestsRes.data ?? []).map((row) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rowAny = row as any;
    const usersRaw = rowAny.users as unknown as
      | { name: string | null; nickname: string | null }
      | { name: string | null; nickname: string | null }[]
      | null;
    const userRow = Array.isArray(usersRaw) ? (usersRaw[0] ?? null) : usersRaw;
    const requesterName =
      userRow?.nickname?.trim() || userRow?.name?.trim() || 'Ukjent';

    return {
      id: rowAny.id as string,
      requesterName,
      requestedAt: rowAny.created_at as string,
    };
  });

  const pendingInvitations: PendingClubInvitation[] = (
    invitationsRes.data ?? []
  ).map((row) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rowAny = row as any;
    return {
      id: rowAny.id as string,
      email: rowAny.email as string,
      invitedAt: rowAny.created_at as string,
    };
  });

  return {
    club: {
      id: clubRes.data.id,
      name: clubRes.data.name,
      short_id: clubRes.data.short_id,
      member_cap: clubRes.data.member_cap ?? null,
      valid_until: clubRes.data.valid_until ?? null,
    },
    members,
    myRole,
    pendingRequests,
    pendingInvitations,
  };
}
