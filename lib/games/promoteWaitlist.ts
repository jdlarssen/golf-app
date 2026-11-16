import 'server-only';
import type { Database } from '@/lib/database.types';
import { expireGameCache } from '@/lib/games/expireGameCache';
import { joinTeeGenders } from '@/lib/games/joinTeeGenders';
import { isMatchplayMode } from '@/lib/games/matchplaySides';
import { registrationSeatTeamSize } from '@/lib/games/teamFormatLimits';
import { sendRegistrationApprovedMail } from '@/lib/mail/registrationApproved';
import { notify } from '@/lib/notifications/notify';
import type { GameMode } from '@/lib/scoring/modes/types';
import { getAdminClient } from '@/lib/supabase/admin';
import { effectiveRegistrationCap, REGISTRATION_CAP_MAX } from '@/lib/wizard/fitsPlayerCount';

/**
 * #2482: a seat freed before the start goes to the first one on the waiting
 * list, who gets a varsel. Called after every write that can free a seat (the
 * list: `waitlistReleaseSites.test.ts`), and when the organiser raises the cap
 * or turns the list on in «Rediger».
 *
 * The rules live in the database: `registration_waitlist` is the queue and
 * `promote_waitlist_seat` gives one seat in one transaction under the game's
 * lock, so a claim and a promotion never hand out the same seat (0239). This
 * loop only picks the head of the queue, works out the tee category
 * (`joinTeeGenders`, as the seat claim's callers do) and sends the varsel. It
 * stops at the first answer that is not `ok`, and never runs more rounds than
 * there were free seats. Without a cap (the organiser removed it) nothing is
 * full, so the whole queue moves up (#2482 F2), at most 200 in one call.
 *
 * Best-effort and never throws: the caller's write is done whatever happens
 * here. A promotion that does not happen leaves the request waiting in the
 * organiser's inbox, where «Godta» still works (U9). The varsel is
 * best-effort too; the seat is given when it is sent.
 *
 * Returns the players who got a seat.
 */
export async function promoteWaitlist(gameId: string): Promise<string[]> {
  try {
    return await promote(gameId);
  } catch (err) {
    console.error('[promoteWaitlist] failed', { gameId, err });
    return [];
  }
}

type WaitlistGame = {
  id: string;
  name: string;
  status: Database['public']['Enums']['game_status'];
  registration_mode: Database['public']['Enums']['registration_mode'];
  waitlist_enabled: boolean;
  signups_closed_at: string | null;
  game_mode: GameMode;
  mode_config: { team_size?: number } | null;
  registration_cap: number | null;
};

async function promote(gameId: string): Promise<string[]> {
  const admin = getAdminClient();
  const { data: game, error: gameError } = await admin
    .from('games')
    .select(
      'id, name, status, registration_mode, waitlist_enabled, signups_closed_at, game_mode, mode_config, registration_cap',
    )
    .eq('id', gameId)
    .maybeSingle<WaitlistGame>();
  if (gameError) {
    console.error('[promoteWaitlist] game read failed', { gameId, error: gameError });
    return [];
  }
  // The cheap no's before any RPC. promote_waitlist_seat checks them all
  // again under the lock; these only spare the round trips.
  if (
    !game ||
    !game.waitlist_enabled ||
    game.registration_mode !== 'open' ||
    game.signups_closed_at != null ||
    (game.status !== 'draft' && game.status !== 'scheduled') ||
    isMatchplayMode(game.game_mode)
  ) {
    return [];
  }
  const cap = effectiveRegistrationCap(game.game_mode, game.mode_config, game.registration_cap);
  const seatTeamSize = registrationSeatTeamSize(game.game_mode, game.mode_config?.team_size);

  let free = REGISTRATION_CAP_MAX;
  if (cap !== null) {
    const { data: held, error: heldError } = await admin.rpc('registration_seats_held', {
      p_game_ids: [gameId],
      p_seat_team_sizes: [seatTeamSize],
    });
    if (heldError) {
      console.error('[promoteWaitlist] seat count failed', { gameId, error: heldError });
      return [];
    }
    free = cap - (held?.[0]?.seats ?? 0);
  }

  const promoted: string[] = [];
  for (let round = 0; round < free; round += 1) {
    const { data: queue, error: queueError } = await admin.rpc('registration_waitlist', {
      p_game_ids: [gameId],
    });
    if (queueError) {
      console.error('[promoteWaitlist] queue read failed', { gameId, error: queueError });
      break;
    }
    const head = (queue ?? []).find((row) => row.place === 1);
    if (!head) break;

    const teeGender = (await joinTeeGenders(gameId, [head.user_id]))[head.user_id];
    const { data: answer, error: promoteError } = await admin.rpc('promote_waitlist_seat', {
      p_game_id: gameId,
      p_request_id: head.request_id,
      // The generated Args type has no null; the SQL reads null as «no cap».
      p_cap: cap as number,
      p_seat_team_size: seatTeamSize,
      p_tee_gender: teeGender,
    });
    if (promoteError) {
      console.error('[promoteWaitlist] promotion failed', { gameId, error: promoteError });
      break;
    }
    const outcome = (answer as { outcome?: unknown } | null)?.outcome;
    // not_first: someone else moved the queue between the read and the call
    // (another promotion, a withdrawn request); read it again.
    if (outcome === 'not_first') continue;
    if (outcome !== 'ok') break;
    promoted.push(head.user_id);
  }

  if (promoted.length > 0) {
    expireGameCache(gameId);
    await notifyPromoted(game, promoted);
  }
  return promoted;
}

/**
 * The varsel each promoted player gets: `registration_approved` with
 * `fromWaitlist`, so the inbox and the mail say «Du fikk plass fra ventelista»
 * instead of the organiser's approval. The mail goes, as for «Godta», only to
 * someone who has been away from the app (`shouldAlsoSendMail`).
 */
async function notifyPromoted(game: WaitlistGame, userIds: string[]): Promise<void> {
  const results = await Promise.allSettled(
    userIds.map((userId) =>
      notify({
        userId,
        kind: 'registration_approved',
        payload: { game_id: game.id, game_name: game.name, fromWaitlist: true },
      }),
    ),
  );
  const forMail = userIds.filter((_, i) => {
    const res = results[i];
    if (res?.status === 'rejected') {
      console.error('[promoteWaitlist] notify failed', res.reason);
      return false;
    }
    return res?.status === 'fulfilled' && res.value.shouldAlsoSendMail;
  });
  if (forMail.length === 0) return;

  const { data: rows, error } = await getAdminClient()
    .from('users')
    .select('id, email, locale')
    .in('id', forMail)
    .returns<{ id: string; email: string; locale: string | null }[]>();
  if (error) {
    console.error('[promoteWaitlist] mail address read failed', error);
    return;
  }
  await Promise.allSettled(
    (rows ?? []).map((u) =>
      sendRegistrationApprovedMail({
        to: u.email,
        gameName: game.name,
        gameId: game.id,
        locale: u.locale,
        fromWaitlist: true,
      }).catch((err) => console.error('[promoteWaitlist] mail failed', err)),
    ),
  );
}
