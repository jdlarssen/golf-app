import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { notify } from '@/lib/notifications/notify';
import { displayNameForOthers } from '@/lib/users/displayName';
import { eveningCounts } from './eveningBeforeRules';

// The reminder to confirm (#463 → #2483): one home for «who has not answered,
// and send them a reminder». It lived in the admin «Status» page's action;
// the organiser's «Klar for i morgen?» needed the same send for one player,
// so it moved here and both actions call it (AGENTS trap 4).
//
// **Authz lies with the caller.** The module reads and sends with the
// service-role client and never asks who calls. Each caller gates first:
// `requireAdmin` on the Status page, `requireAdminOrCreator` on
// «Klar for i morgen?». A caller without a gate is a way for anyone to send
// reminders to someone else's players.
//
// The kind is `player_added`, as it always was: the card asks the player to
// confirm, and opening the game confirms. No once-only guard: the organiser
// may remind again.

// The search string for this send in the Vercel log since #463.
const LOG_PREFIX = 'remindUnconfirmedPlayers';

const REMINDABLE_STATUSES = new Set(['scheduled', 'active']);

export type UnconfirmedReminderResult =
  | { ok: true; reminded: number }
  | { ok: false; reason: 'not_found' | 'not_active' };

type RosterRow = {
  user_id: string;
  withdrawn_at: string | null;
  accepted_at: string | null;
  users: { is_guest: boolean } | null;
};

/**
 * Remind everyone in the round who has not confirmed: on the list, not
 * withdrawn, not a guest (`eveningCounts`, the same rule as the «Ikke svart»
 * rows), while the round is scheduled or in progress. `userIds` narrows that
 * set and never widens it: a user id that is not such a player gets nothing.
 *
 * Throws on a failed read: an unread list is not «nobody to remind». The sends
 * are best-effort: one failed `notify` never stops the others.
 */
export async function sendUnconfirmedReminders(
  gameId: string,
  opts: { userIds?: readonly string[] } = {},
): Promise<UnconfirmedReminderResult> {
  const admin = getAdminClient();
  const { data: game, error: gameError } = await admin
    .from('games')
    .select('id, name, status, created_by')
    .eq('id', gameId)
    .maybeSingle<{ id: string; name: string; status: string; created_by: string | null }>();
  if (gameError) throw new Error(`${LOG_PREFIX} game: ${gameError.message}`);
  if (!game) return { ok: false, reason: 'not_found' };
  if (!REMINDABLE_STATUSES.has(game.status)) return { ok: false, reason: 'not_active' };

  const { data: rows, error: rosterError } = await admin
    .from('game_players')
    .select('user_id, withdrawn_at, accepted_at, users!game_players_user_id_fkey(is_guest)')
    .eq('game_id', gameId)
    .is('accepted_at', null)
    .returns<RosterRow[]>();
  if (rosterError) throw new Error(`${LOG_PREFIX} roster: ${rosterError.message}`);

  const only = opts.userIds ? new Set(opts.userIds) : null;
  const targets = eveningCounts(
    (rows ?? []).map((r) => ({ ...r, is_guest: r.users?.is_guest === true })),
  ).unanswered.filter((r) => only == null || only.has(r.user_id));
  if (targets.length === 0) return { ok: true, reminded: 0 };

  // The players see who added them, so a nameless organiser shows masked
  // (#2271). No organiser, or no name and no address: «Tørny».
  let addedByName = 'Tørny';
  if (game.created_by) {
    const { data: creator } = await admin
      .from('users')
      .select('name, email')
      .eq('id', game.created_by)
      .maybeSingle<{ name: string | null; email: string | null }>();
    if (creator) addedByName = displayNameForOthers(creator) ?? 'Tørny';
  }

  await Promise.allSettled(
    targets.map((p) =>
      notify({
        userId: p.user_id,
        kind: 'player_added',
        payload: { game_id: game.id, game_name: game.name, added_by_name: addedByName },
      }).catch((err) => {
        console.error(`[${LOG_PREFIX}] notify failed`, { gameId, userId: p.user_id, err });
      }),
    ),
  );

  return { ok: true, reminded: targets.length };
}
