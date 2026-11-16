import 'server-only';
import type { getAdminClient } from '@/lib/supabase/admin';
import { firstName } from '@/lib/firstName';
import { displayNameForOthers } from '@/lib/users/displayName';
import { getPrivateUserFields } from '@/lib/users/privateUserFields';
import { sendOrganizerGameNotice } from '@/lib/mail/organizerGameNotice';
import {
  eveningCounts,
  isEveningNoticeDue,
  summarizeUnanswered,
  type EveningGame,
} from '@/lib/games/eveningBeforeRules';
import { inboxPerson } from './inboxSections';
import { notify } from './notify';
import type { NotificationPayload } from './types';

// The organiser's status the evening before a scheduled round (#2483). The
// rule lives in `lib/games/eveningBeforeRules.ts`; this file reads the list,
// claims the stamp and sends.
//
// The varsel goes once per round. The claim is the same «win the row» update
// as `runStaleGameReminderForGame`: the stamp is set only where it is still
// null and the round is still scheduled, and only a caller that got the row
// back sends. Two sweeps that meet therefore send nothing twice. Moving the
// tee-off clears the stamp, so the varsel comes again the evening before the
// new day.
//
// In the app first: `notify` stores the varsel and pushes when the organiser
// is away. A mail goes only when `notify` says `shouldAlsoSendMail`.

type AdminClient = ReturnType<typeof getAdminClient>;

/** The game the sweep hands over, read by the route. */
export type EveningSweepGame = EveningGame & { id: string; name: string };

type RosterRow = {
  user_id: string;
  withdrawn_at: string | null;
  accepted_at: string | null;
  users: { name: string | null; nickname: string | null; email: string | null; is_guest: boolean } | null;
};

const LOG_PREFIX = 'eveningBefore';

/**
 * The evening varsel for one round: read the list, ask `isEveningNoticeDue`,
 * and when it is due, claim the stamp and send `organizer_evening_status` to
 * the organiser.
 *
 * Throws on a failed read or claim, so the route can catch and count it per
 * round and one round never costs the others their varsel. The send itself is
 * best-effort.
 */
export async function runEveningNoticeForGame(
  admin: AdminClient,
  game: EveningSweepGame,
  now: number,
): Promise<{ notified: boolean }> {
  if (game.created_by == null) return { notified: false };
  const organizerId = game.created_by;

  const { data, error } = await admin
    .from('game_players')
    .select(
      'user_id, withdrawn_at, accepted_at, users!game_players_user_id_fkey(name, nickname, email, is_guest)',
    )
    .eq('game_id', game.id)
    .returns<RosterRow[]>();
  if (error) throw new Error(`${LOG_PREFIX} roster: ${error.message}`);
  const roster = (data ?? []).map((r) => ({ ...r, is_guest: r.users?.is_guest === true }));

  if (!isEveningNoticeDue(game, roster, now)) return { notified: false };

  const { data: won, error: claimError } = await admin
    .from('games')
    .update({ organizer_evening_notice_sent_at: new Date(now).toISOString() })
    .eq('id', game.id)
    .is('organizer_evening_notice_sent_at', null)
    .eq('status', 'scheduled')
    .select('id');
  if (claimError) throw new Error(`${LOG_PREFIX} claim: ${claimError.message}`);
  if (!won || won.length === 0) return { notified: false };

  const counts = eveningCounts(roster);
  // First names as the inbox shows them; a nameless player by the masked
  // address (#2271), never the whole of it.
  const names = counts.unanswered.map((r) =>
    r.users ? (inboxPerson(displayNameForOthers(r.users))?.short ?? null) : null,
  );
  const payload: NotificationPayload<'organizer_evening_status'> = {
    game_id: game.id,
    game_name: game.name,
    tee_off_at: game.scheduled_tee_off_at!,
    confirmed: counts.confirmed.length,
    total: counts.total,
    ...summarizeUnanswered(names),
  };

  await sendEveningStatus(admin, organizerId, game, payload);
  return { notified: true };
}

/**
 * The varsel (in-app, push when away), then the mail when `notify` says the
 * organiser is off-app. Best-effort: never throws.
 */
async function sendEveningStatus(
  admin: AdminClient,
  organizerId: string,
  game: EveningSweepGame,
  payload: NotificationPayload<'organizer_evening_status'>,
): Promise<void> {
  let shouldMail = false;
  try {
    const r = await notify({ userId: organizerId, kind: 'organizer_evening_status', payload });
    shouldMail = r.shouldAlsoSendMail;
  } catch (err) {
    console.error(`[${LOG_PREFIX}] notify failed`, { gameId: game.id, err });
    return;
  }
  if (!shouldMail) return;

  try {
    const [userRes, privateFields] = await Promise.all([
      admin
        .from('users')
        .select('name, locale')
        .eq('id', organizerId)
        .maybeSingle<{ name: string | null; locale: string | null }>(),
      getPrivateUserFields([organizerId]),
    ]);
    const email = privateFields.get(organizerId)?.email;
    if (!email) return;
    await sendOrganizerGameNotice({
      to: email,
      recipientFirstName: firstName(userRes.data?.name ?? null),
      gameName: game.name,
      gameId: game.id,
      locale: userRes.data?.locale ?? null,
      variant: 'evening',
      status: payload,
    });
  } catch (err) {
    console.error(`[${LOG_PREFIX}] mail failed`, { gameId: game.id, err });
  }
}
