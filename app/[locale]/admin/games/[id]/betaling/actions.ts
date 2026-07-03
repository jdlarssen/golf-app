'use server';

import { revalidateTag } from 'next/cache';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { expectAffected } from '@/lib/supabase/affectedRows';
import { logAdminEvent } from '@/lib/admin/auditLog';
import { sendPaymentReminder } from '@/lib/notifications/paymentReminder';

type UnpaidPlayerRow = {
  user_id: string;
  paid_at: string | null;
  withdrawn_at: string | null;
  users: {
    email: string | null;
    name: string | null;
    locale: string | null;
    is_guest: boolean;
  } | null;
};

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

/**
 * #1049: purr alle spillere som mangler å betale startkontingenten — in-app
 * varsel + mail-if-off-app. Best-effort (Promise.allSettled): én feil stopper
 * ikke resten, og action-en aborterer aldri. Ingen idempotens-stamp — arrangøren
 * kan purre på nytt ved behov (samme mønster som remindUnconfirmedPlayers).
 * Gjester purres ikke (plassholder-adresse). Returnerer antall purret så knappen
 * kan vise en bekreftelse uten en redirect.
 */
export async function remindUnpaidPlayers(
  gameId: string,
): Promise<{ count: number }> {
  const supabase = await getServerClient();
  await requireAdmin(supabase);

  const { data: game } = await supabase
    .from('games')
    .select('id, name, status, entry_fee_kr, payment_link')
    .eq('id', gameId)
    .single<{
      id: string;
      name: string;
      status: string;
      entry_fee_kr: number;
      payment_link: string | null;
    }>();

  // Ingen kontingent → ingenting å purre for.
  if (!game || game.entry_fee_kr <= 0) return { count: 0 };

  const { data: players } = await supabase
    .from('game_players')
    .select(
      'user_id, paid_at, withdrawn_at, users!game_players_user_id_fkey(email, name, locale, is_guest)',
    )
    .eq('game_id', gameId)
    .returns<UnpaidPlayerRow[]>();

  const targets = (players ?? []).filter(
    (p) => !p.paid_at && !p.withdrawn_at && !p.users?.is_guest,
  );

  await Promise.allSettled(
    targets.map((p) =>
      sendPaymentReminder({
        player: {
          userId: p.user_id,
          email: p.users?.email ?? null,
          name: p.users?.name ?? null,
          locale: p.users?.locale ?? null,
        },
        game: {
          id: game.id,
          name: game.name,
          entryFeeKr: game.entry_fee_kr,
          paymentLink: game.payment_link,
        },
        logPrefix: 'remindUnpaidPlayers',
      }),
    ),
  );

  return { count: targets.length };
}
