'use server';

import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import {
  remindUnpaidPlayers as remindUnpaidPlayersCore,
  setPlayerPaid,
} from '@/lib/games/payments';

/**
 * #1049: arrangøren huker av / fjerner betalt-status på en spiller.
 *
 * Admin-only (samme cockpit-nivå som `/signups`). RLS + guard-triggeren (0133)
 * er backstop — en spiller kan ALDRI sette sin egen `paid_at` via en direkte
 * PATCH; kun admin/creator. Her skriver vi via bruker-klienten som admin.
 * Skrivingen, 0-rad-sjekken, audit-raden og cachen bor i `lib/games/payments.ts`
 * (#2749), som appens rute også kaller.
 */
export async function togglePlayerPaid(
  gameId: string,
  userId: string,
  paid: boolean,
): Promise<void> {
  const supabase = await getServerClient();
  const role = await requireAdmin(supabase);

  await setPlayerPaid(supabase, {
    gameId,
    userId,
    paid,
    actor: { id: role.userId, name: role.name?.trim() || 'Admin' },
  });

  // Betaling-siden leser game_players ferskt; spill-hjem/PaymentInfo leser via
  // getGameWithPlayers (cache-tag `game-${id}`, tømt i kjernen).
  revalidatePath(`/admin/games/${gameId}/betaling`);
}

/**
 * #1049: purr alle spillere som mangler å betale startkontingenten. Målregelen
 * og sendingen bor i `lib/games/payments.ts` (#2749). Returnerer antall purret
 * så knappen kan vise en bekreftelse uten en redirect.
 */
export async function remindUnpaidPlayers(
  gameId: string,
): Promise<{ count: number }> {
  const supabase = await getServerClient();
  await requireAdmin(supabase);
  return remindUnpaidPlayersCore(supabase, gameId);
}
