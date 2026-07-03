'use server';

import { revalidateTag } from 'next/cache';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { expectAffected } from '@/lib/supabase/affectedRows';
import { logAdminEvent } from '@/lib/admin/auditLog';

/**
 * #1049: arrangøren huker av / fjerner betalt-status på en spiller.
 *
 * Admin-only (samme cockpit-nivå som `/signups`). RLS + guard-triggeren (0133)
 * er backstop — en spiller kan ALDRI sette sin egen `paid_at` via en direkte
 * PATCH; kun admin/creator. Her skriver vi via bruker-klienten som admin.
 */
export async function togglePlayerPaid(
  gameId: string,
  userId: string,
  paid: boolean,
): Promise<void> {
  const supabase = await getServerClient();
  const role = await requireAdmin(supabase);

  // 0-rad-skriv = feil (trap #2): PostgREST returnerer error==null når ingen
  // rad matcher (feil game/user, eller RLS blokkerte). `.select()` +
  // expectAffected gjør en stille no-op til en kastende feil.
  const result = await supabase
    .from('game_players')
    .update({ paid_at: paid ? new Date().toISOString() : null })
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .select('user_id');
  expectAffected(result, 'togglePlayerPaid');

  await logAdminEvent({
    actorId: role.userId,
    actorName: role.name?.trim() || 'Admin',
    eventType: paid ? 'game.player_marked_paid' : 'game.player_marked_unpaid',
    targetType: 'game',
    targetId: gameId,
    payload: { gameId, userId },
  });

  // Betaling-siden leser game_players ferskt; spill-hjem/PaymentInfo leser via
  // getGameWithPlayers (cache-tag `game-${id}`). Bust begge.
  revalidateTag(`game-${gameId}`, 'max');
  revalidatePath(`/admin/games/${gameId}/betaling`);
}
