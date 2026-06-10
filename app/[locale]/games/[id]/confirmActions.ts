'use server';

import { revalidateTag } from 'next/cache';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';

export type ConfirmResult = { ok: true } | { ok: false; error: string };

/**
 * #463 — eksplisitt «Bekreft deltakelse»-handling for et spill. RLS-backed
 * (bruker-klient): policyen `game_players self mark accepted` (0082) lar
 * brukeren sette `accepted_at` kun på sin egen, fortsatt-pending rad.
 */
export async function confirmParticipation(gameId: string): Promise<ConfirmResult> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'not_authenticated' };

  const { error } = await supabase
    .from('game_players')
    .update({ accepted_at: new Date().toISOString() })
    .eq('game_id', gameId)
    .eq('user_id', user.id)
    .is('accepted_at', null);

  if (error) {
    console.error('[confirmParticipation] update failed', error);
    return { ok: false, error: 'db_error' };
  }
  revalidateTag(`game-${gameId}`, 'max');
  return { ok: true };
}

/**
 * #463 — eksplisitt «Bekreft deltakelse»-handling for en liga. RLS-backed via
 * `league_players self mark accepted` (0082).
 */
export async function confirmLeagueParticipation(
  leagueId: string,
): Promise<ConfirmResult> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'not_authenticated' };

  const { error } = await supabase
    .from('league_players')
    .update({ accepted_at: new Date().toISOString() })
    .eq('league_id', leagueId)
    .eq('user_id', user.id)
    .is('accepted_at', null);

  if (error) {
    console.error('[confirmLeagueParticipation] update failed', error);
    return { ok: false, error: 'db_error' };
  }
  revalidatePath(`/liga/${leagueId}`);
  return { ok: true };
}
