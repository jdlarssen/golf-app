import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

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
 * Klubb-opprettelse er admin-gated fra #50 (kun is_admin oppretter + overfører),
 * så «opprettet av meg»-tellingen fra #442 er borte — vanlige brukere oppretter
 * ikke lenger klubber.
 */
export async function getMyClubs(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<{ clubs: MyClub[] }> {
  const { data } = await supabase
    .from('group_members')
    .select('role, groups(id, name, short_id)')
    .eq('user_id', userId)
    .order('joined_at', { ascending: true });

  const clubs: MyClub[] = (data ?? []).map((row) => {
    // `groups` is a many-to-one embed, so PostgREST returns an object. Read it
    // null-safe anyway: this is the RLS client, and a groups policy that hides
    // the row would leave the embed null at runtime.
    const group = row.groups;

    return {
      id: group?.id ?? '',
      name: group?.name ?? '',
      short_id: group?.short_id ?? '',
      role: row.role as 'owner' | 'admin' | 'member',
    };
  });

  return { clubs };
}
