import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { notify } from './notify';
import { displayNameForOthers } from '@/lib/users/displayName';

/**
 * Best-effort `invite`-varsel til en spiller som er lagt til i et game.
 *
 * Brukes blant annet fra:
 *  1. Picker-add (`addExistingPlayerToGameCore`): webbens «Inviter spillere»
 *     og appens «Legg til spiller» (umiddelbar add).
 *  2. Edit-flyten for et planlagt spill (for hver ny spiller).
 *  3. Deferred etter OTP-verify når en ukjent e-post aksepterer en
 *     game-scoped invitasjon.
 *  4. `notifyRosterInvites`, når et spill publiseres: fra appen (#2215) og fra
 *     webbens opprett- og edit-flyt (#2445).
 *
 * Henter game-navn + inviter-navn via admin-client (server-only context,
 * post-auth verifisert hos caller). Hopper over varselet hvis spillet er
 * `draft` (#2445: varselet kommer ved publisering) eller `finished` — å
 * varsle om et avsluttet spill ville bare være forvirrende.
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

  // A draft never notifies (#2445): the players hear about the game once, when
  // it is published (`notifyRosterInvites`). A finished round never notifies
  // either: the notification would land in an inbox with no next step for the
  // player. Every caller only notifies before the round starts, and
  // verifyCode skips active and finished rounds since #2212. The guard stays
  // so a new caller cannot send a notification the player cannot act on.
  if (game.status === 'draft' || game.status === 'finished') {
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

  const invitedByName = displayNameForOthers(inviter) ?? 'Tørny';

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
