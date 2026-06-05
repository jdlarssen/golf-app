import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type MyClub = {
  id: string;
  name: string;
  short_id: string;
  role: 'owner' | 'admin' | 'member';
};

/**
 * Returns the clubs the given user is a member of (via group_members).
 *
 * Uses the request-scoped client so RLS applies — a user only sees the
 * group_members rows for groups they belong to.
 *
 * FK-join normalisation: Supabase types the groups join as an array even for
 * a one-to-one relation. Mirror the pattern from getDiscoverableGames.ts.
 *
 * Klubb-opprettelse er admin-gated fra #50 (kun is_admin oppretter + overfører),
 * så «opprettet av meg»-tellingen fra #442 er borte — vanlige brukere oppretter
 * ikke lenger klubber.
 */
export async function getMyClubs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  userId: string,
): Promise<{ clubs: MyClub[] }> {
  const { data } = await supabase
    .from('group_members')
    .select('role, groups(id, name, short_id)')
    .eq('user_id', userId)
    .order('joined_at', { ascending: true });

  const clubs: MyClub[] = (data ?? []).map((row) => {
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

  return { clubs };
}
