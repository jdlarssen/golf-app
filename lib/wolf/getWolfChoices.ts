import 'server-only';
import { unstable_cache } from 'next/cache';
import { getAdminClient } from '@/lib/supabase/admin';
import type { WolfChoice, WolfHoleChoice } from '@/lib/scoring/modes/types';

/**
 * Tag-cached fetch av wolf_hole_choices for ett spill.
 *
 * Returnerer alle valg sortert på hole_number ASC. Brukes av scoring-laget
 * (mater inn i `ScoringContext.wolfChoices`) og av hull-UI (vise current
 * wolf-valg som badge).
 *
 * Cache-tag: `game-${id}` — samme som `getGameWithPlayers`. Mutasjons-server-
 * actions (`setWolfChoice`) revaliderer denne ved hver endring. 15-min
 * revalidate som safety net for direkte DB-endringer.
 *
 * Bruker admin-client (cookies() kan ikke kalles inne i unstable_cache).
 * Authz håndheves på call-site og av RLS-policy på write.
 */
async function fetchWolfChoices(gameId: string): Promise<WolfHoleChoice[]> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('wolf_hole_choices')
    .select('hole_number, wolf_user_id, choice, partner_user_id')
    .eq('game_id', gameId)
    .order('hole_number', { ascending: true });

  if (error) {
    console.error('[getWolfChoices] query failed', { gameId, error });
    throw new Error('Failed to fetch wolf choices');
  }

  return (data ?? []).map((row) => ({
    holeNumber: row.hole_number,
    wolfUserId: row.wolf_user_id,
    choice: row.choice as WolfChoice,
    partnerUserId: row.partner_user_id,
  }));
}

export async function getWolfChoices(gameId: string): Promise<WolfHoleChoice[]> {
  return unstable_cache(
    () => fetchWolfChoices(gameId),
    ['wolf-choices', gameId],
    { tags: [`game-${gameId}`], revalidate: 900 },
  )();
}
