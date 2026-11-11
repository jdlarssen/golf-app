import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { logAdminEvent } from '@/lib/admin/auditLog';
import { expireGameCache } from '@/lib/games/expireGameCache';
import { sendPaymentReminder } from '@/lib/notifications/paymentReminder';
import { playerNameWithNicknameAfter } from '@/lib/names/playerName';
import { getAdminClient } from '@/lib/supabase/admin';
import { expectAffected } from '@/lib/supabase/affectedRows';
import { isRemindable, paymentCounts } from '@/lib/games/paymentRules';

export { isRemindable, paymentCounts };

/**
 * #2749: the entry-fee core — who has paid, ticking it, and the reminder. One
 * home for the rules (trap 4): the web's «Hvem har betalt?» (server actions,
 * `requireAdmin`) and the app's routes (`/api/games/[id]/payments`, organiser
 * gate) are two transports in front of it. The core has no authz of its own;
 * each caller's gate is the enforcement, and RLS plus the 0191 guard stay the
 * backstop for a direct PATCH.
 */

type Client = SupabaseClient<Database>;

export type PaymentRosterPlayer = {
  userId: string;
  /** Name with «nickname», as the web shows it. `null` when the profile can't be read. */
  name: string | null;
  isGuest: boolean;
  withdrawn: boolean;
  paid: boolean;
};

export type PaymentRoster = {
  gameName: string;
  entryFeeKr: number;
  players: PaymentRosterPlayer[];
  /** Paid among those who haven't withdrawn: the «2 / 4» on the card. */
  paidCount: number;
  /** Everyone who hasn't withdrawn. */
  totalCount: number;
  /** Who «Purr de som mangler» reaches: not paid, not withdrawn, not a guest. */
  remindable: number;
};

type RosterRow = {
  user_id: string;
  paid_at: string | null;
  withdrawn_at: string | null;
  users: { name: string | null; nickname: string | null; is_guest: boolean } | null;
};

/**
 * The game's fee and players for «Hvem har betalt?». `null` when the game can't
 * be read with `client`. Throws on a read error, so a page or route never shows
 * an empty list for a failed one.
 */
export async function paymentRoster(client: Client, gameId: string): Promise<PaymentRoster | null> {
  const { data: game, error: gameError } = await client
    .from('games')
    .select('name, entry_fee_kr')
    .eq('id', gameId)
    .maybeSingle<{ name: string; entry_fee_kr: number }>();
  if (gameError) throw gameError;
  if (!game) return null;

  const { data: rows, error } = await client
    .from('game_players')
    .select('user_id, paid_at, withdrawn_at, users!game_players_user_id_fkey(name, nickname, is_guest)')
    .eq('game_id', gameId)
    .returns<RosterRow[]>();
  if (error) throw error;

  const players = (rows ?? []).map((r) => ({
    userId: r.user_id,
    // The web's name rule (`playerNameWithNicknameAfter`): `Ola Nordmann «Kalle»`.
    name: r.users?.name ? playerNameWithNicknameAfter(r.users.name, r.users.nickname) : null,
    isGuest: r.users?.is_guest ?? false,
    withdrawn: r.withdrawn_at != null,
    paid: r.paid_at != null,
  }));
  return { gameName: game.name, entryFeeKr: game.entry_fee_kr, players, ...paymentCounts(players) };
}

/**
 * Ticks a player as paid, or clears it. A write that matches no row throws
 * (trap 2): a wrong game or player, or RLS said no. Then the audit row and the
 * game cache, so the player's card says «betalt» on the next read.
 */
export async function setPlayerPaid(
  client: Client,
  {
    gameId,
    userId,
    paid,
    actor,
  }: { gameId: string; userId: string; paid: boolean; actor: { id: string; name: string } },
): Promise<void> {
  const result = await client
    .from('game_players')
    .update({ paid_at: paid ? new Date().toISOString() : null })
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .select('user_id');
  expectAffected(result, 'setPlayerPaid');

  await logAdminEvent({
    actorId: actor.id,
    actorName: actor.name,
    eventType: paid ? 'game.player_marked_paid' : 'game.player_marked_unpaid',
    targetType: 'game',
    targetId: gameId,
    payload: { gameId, userId },
  });
  expireGameCache(gameId);
}

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
 * Reminds everyone who hasn't paid the entry fee: an in-app notice, and mail
 * when they're off the app. Best effort (`Promise.allSettled`): one failure
 * stops neither the rest nor the caller. No idempotency stamp, so the organiser
 * can remind again. Guests are not reminded (placeholder address). The game is
 * read with `client`, the players with the admin client (their e-mail).
 */
export async function remindUnpaidPlayers(client: Client, gameId: string): Promise<{ count: number }> {
  const { data: game } = await client
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

  // No fee, nothing to remind about.
  if (!game || game.entry_fee_kr <= 0) return { count: 0 };

  const { data: players } = await getAdminClient()
    .from('game_players')
    .select('user_id, paid_at, withdrawn_at, users!game_players_user_id_fkey(email, name, locale, is_guest)')
    .eq('game_id', gameId)
    .returns<UnpaidPlayerRow[]>();

  const targets = (players ?? []).filter((p) =>
    isRemindable({ paid: p.paid_at != null, withdrawn: p.withdrawn_at != null, isGuest: p.users?.is_guest ?? false }),
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
