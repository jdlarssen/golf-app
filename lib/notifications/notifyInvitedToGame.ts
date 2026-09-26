import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { notify } from './notify';

/**
 * Best-effort `invite`-varsel til en spiller som er lagt til i et game.
 *
 * Brukes fra tre call-sites:
 *  1. Picker-add fra `/admin/games/[id]` (umiddelbar add).
 *  2. Backfill i `/admin/games/new` og edit-flyten (for hver ny spiller).
 *  3. Deferred etter OTP-verify når en ukjent e-post aksepterer en
 *     game-scoped invitasjon.
 *
 * Henter game-navn + inviter-navn via admin-client (server-only context,
 * post-auth verifisert hos caller). Hopper over varselet hvis spillet er
 * `finished` — å varsle om et avsluttet spill ville bare være forvirrende.
 *
 * Feiler stille: all DB-feil eller notify-rejection blir loggført med
 * `[notifyInvitedToGame]`-prefix og swallow-et. Caller skal alltid kunne
 * commit-e game_players-insertet uansett hva som skjer her.
 */
export async function notifyInvitedToGame(opts: {
  recipientUserId: string;
  gameId: string;
  inviterUserId: string;
}): Promise<void> {
  const { recipientUserId, gameId, inviterUserId } = opts;
  const admin = getAdminClient();

  const { data: game, error: gameError } = await admin
    .from('games')
    .select('id, name, status')
    .eq('id', gameId)
    .single<{ id: string; name: string; status: string }>();

  if (gameError || !game) {
    console.error('[notifyInvitedToGame] game lookup failed', gameError);
    return;
  }

  // A finished round never notifies: the notification would land in an inbox
  // with no next step for the player. Defensive: every caller only notifies
  // before the round starts. verifyCode skips active and finished rounds since
  // #2212. The guard stays so a new caller cannot send a notification the
  // player cannot act on.
  if (game.status === 'finished') {
    return;
  }

  const { data: inviter, error: inviterError } = await admin
    .from('users')
    .select('id, name, email')
    .eq('id', inviterUserId)
    .single<{ id: string; name: string | null; email: string | null }>();

  if (inviterError || !inviter) {
    console.error('[notifyInvitedToGame] inviter lookup failed', inviterError);
    return;
  }

  const invitedByName = inviter.name ?? inviter.email ?? 'Tørny';

  try {
    await notify({
      userId: recipientUserId,
      kind: 'invite',
      payload: {
        game_id: game.id,
        game_name: game.name,
        invited_by_name: invitedByName,
      },
    });
  } catch (err) {
    console.error('[notifyInvitedToGame] notify failed', err);
  }
}
