'use server';

import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';
import { expectOne } from '@/lib/supabase/affectedRows';

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
  if (!user) {
    const locale = await getLocale();
    redirect({ href: '/login', locale });
  }

  // A 0-row write is logged, not thrown (#2280): the card staying put is the
  // player's signal, and an error page would be worse for a one-tap confirm.
  try {
    expectOne(
      await supabase
        .from('users')
        .update({ handicap_updated_at: new Date().toISOString() })
        .eq('id', user.id)
        .select('id'),
      '[confirmHandicap]',
    );
  } catch (error) {
    console.error('[confirmHandicap] update failed', error);
  }

  // The handicap timestamp is fetched outside the tag-cached
  // getGameWithPlayers payload (see app/games/[id]/(home)/page.tsx), so a path
  // revalidate is sufficient — no tag invalidation needed.
  revalidatePath(`/games/${gameId}`);
}
