import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { getAdminClient } from '@/lib/supabase/admin';
import { playerName } from '@/lib/names/playerName';

/**
 * #3019: the people the caller has blocked, newest first, for the app's
 * «Blokkerte». The rows are read as the caller (RLS «user_blocks select own»,
 * 0259), so the list can only ever hold the caller's own blocks; the names
 * come from the service role, because a block ends the friendship that made
 * the other person's row readable.
 */
export type BlockedPerson = { userId: string; name: string | null; blockedAt: string };

export async function listBlocksCore(
  caller: SupabaseClient<Database>,
  callerId: string,
): Promise<{ ok: true; blocks: BlockedPerson[] } | { ok: false }> {
  const { data: rows, error } = await caller
    .from('user_blocks')
    .select('blocked_id, created_at')
    .eq('blocker_id', callerId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[blocks] read failed', error);
    return { ok: false };
  }
  if (!rows || rows.length === 0) return { ok: true, blocks: [] };

  const { data: people, error: peopleError } = await getAdminClient()
    .from('users')
    .select('id, name, nickname')
    .in(
      'id',
      rows.map((r) => r.blocked_id),
    );
  if (peopleError) {
    console.error('[blocks] names failed', peopleError);
    return { ok: false };
  }
  const byId = new Map((people ?? []).map((p) => [p.id, playerName(p)]));
  return {
    ok: true,
    blocks: rows.map((r) => ({
      userId: r.blocked_id,
      name: byId.get(r.blocked_id) ?? null,
      blockedAt: r.created_at,
    })),
  };
}
