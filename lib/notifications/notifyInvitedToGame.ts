import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { notify } from './notify';
import { displayNameForOthers } from '@/lib/users/displayName';
import { playerTeeOff, type TeeTimePlayer } from '@/lib/games/flightTeeTimes';
import { expectedTeamSize } from '@/lib/games/teamScope';
import type { GameMode } from '@/lib/scoring/modes/types';

type InviteGameRow = {
  id: string;
  name: string;
  status: string;
  game_mode: GameMode;
  mode_config: { team_size?: number } | null;
  scheduled_tee_off_at: string | null;
  tee_interval_minutes: number | null;
};

/**
 * #2451: the recipient's own start time when the round has several start
 * groups, else `undefined`. The roster is read only when the round has a
 * tee-off and an interval; a failed read is logged and the invitation goes
 * out without the time, as before.
 */
async function ownTeeOffAt(
  admin: ReturnType<typeof getAdminClient>,
  game: InviteGameRow,
  recipientUserId: string,
): Promise<string | undefined> {
  if (game.scheduled_tee_off_at == null || game.tee_interval_minutes == null) return undefined;
  const { data, error } = await admin
    .from('game_players')
    .select('user_id, flight_number, team_number, withdrawn_at')
    .eq('game_id', game.id)
    .returns<TeeTimePlayer[]>();
  if (error) {
    console.error('[notifyInvitedToGame] roster lookup failed', error);
    return undefined;
  }
  const players = data ?? [];
  const me = players.find((p) => p.user_id === recipientUserId);
  if (!me) return undefined;
  return playerTeeOff(
    {
      game_mode: game.game_mode,
      team_size: expectedTeamSize(game.mode_config),
      scheduled_tee_off_at: game.scheduled_tee_off_at,
      tee_interval_minutes: game.tee_interval_minutes,
      players,
    },
    me,
  )?.teeOffAt;
}

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
 * #2451: when the round has several start groups the payload carries the
 * player's own start time (`tee_off_at`), and the card says «Lørdagsrunden ·
 * du går ut 09:10». No new kind, no migration: the field is optional.
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
    .select('id, name, status, game_mode, mode_config, scheduled_tee_off_at, tee_interval_minutes')
    .eq('id', gameId)
    .single<InviteGameRow>();

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
  const teeOffAt = await ownTeeOffAt(admin, game, recipientUserId);

  try {
    await notify({
      userId: recipientUserId,
      kind: 'invite',
      payload: {
        game_id: game.id,
        game_name: game.name,
        invited_by_name: invitedByName,
        ...(teeOffAt ? { tee_off_at: teeOffAt } : {}),
      },
    });
  } catch (err) {
    console.error('[notifyInvitedToGame] notify failed', err);
  }
}
