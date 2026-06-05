import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type MyClub = {
  id: string;
  name: string;
  short_id: string;
  role: 'owner' | 'admin' | 'member';
};

/**
 * Returns the clubs the given user is a member of (via group_members), plus
 * the count of clubs they *created* (for cap-gating the «Opprett klubb»
 * button client-side — the RPC enforces the cap server-side).
 *
 * Uses the request-scoped client so RLS applies — a user only sees the
 * group_members rows for groups they belong to.
 *
 * FK-join normalisation: Supabase types the groups join as an array even for
 * a one-to-one relation. Mirror the pattern from getDiscoverableGames.ts
 * lines 82-88.
 */
export async function getMyClubs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  userId: string,
): Promise<{ clubs: MyClub[]; createdCount: number }> {
  const [membershipsRes, createdCountRes] = await Promise.all([
    supabase
      .from('group_members')
      .select('role, groups(id, name, short_id)')
      .eq('user_id', userId)
      .order('joined_at', { ascending: true }),
    supabase
      .from('groups')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', userId),
  ]);

  const clubs: MyClub[] = (membershipsRes.data ?? []).map((row) => {
    // Supabase types FK-join as array even for a one-to-one relation.
    // Normalise to the first element (or null) before reading fields.
    const groupsRaw = row.groups as unknown as
      | { id: string; name: string; short_id: string }
      | { id: string; name: string; short_id: string }[]
      | null;
    const group = Array.isArray(groupsRaw) ? groupsRaw[0] ?? null : groupsRaw;

    return {
      id: group?.id ?? '',
      name: group?.name ?? '',
      short_id: group?.short_id ?? '',
      role: row.role as 'owner' | 'admin' | 'member',
    };
  });

  return {
    clubs,
    createdCount: createdCountRes.count ?? 0,
  };
}
