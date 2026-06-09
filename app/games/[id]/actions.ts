'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getServerClient } from '@/lib/supabase/server';

/**
 * Player-confirmed: "yes, my handicap is still right." Bumps
 * `users.handicap_updated_at` to now so the stale-handicap card in the
 * scheduled-game waiting room disappears on the next render.
 *
 * The card is gated on `isHandicapStale` (lib/handicap/staleness.ts) which
 * reads the same column, so this single write is sufficient to dismiss it.
 *
 * Idempotent and self-scoped — the WHERE clause uses the authenticated
 * user id, so a malicious client cannot bump someone else's timestamp
 * even if they craft a different gameId.
 */
export async function confirmHandicap(gameId: string) {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { error } = await supabase
    .from('users')
    .update({ handicap_updated_at: new Date().toISOString() })
    .eq('id', user.id);

  if (error) {
    console.error('[confirmHandicap] update failed', error);
  }

  // The handicap timestamp is fetched outside the tag-cached
  // getGameWithPlayers payload (see app/games/[id]/(home)/page.tsx), so a path
  // revalidate is sufficient — no tag invalidation needed.
  revalidatePath(`/games/${gameId}`);
}
