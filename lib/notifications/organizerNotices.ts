import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { firstName } from '@/lib/firstName';
import { getPrivateUserFields } from '@/lib/users/privateUserFields';
import { sendOrganizerGameNotice } from '@/lib/mail/organizerGameNotice';
import { allDelivered, isStale, organizerNoticesApply } from '@/lib/games/organizerNoticeRules';
import { notify } from './notify';

// The organiser's two finish messages (#2203). The rules live in
// `lib/games/organizerNoticeRules.ts`; this file reads, claims and sends.
//
// Each message goes once per game. The claim is the same «win the row» update
// as `maybeNotifyAutoStartBlocked`: the stamp is set only where it is still
// null and the game is still active, and only a caller that got the row back
// sends. Two last deliveries at once, a double tap, or a second sweep therefore
// send nothing twice (the owner's answer 2026-10-05: «Én per spill»).
//
// In the app first: `notify` stores the varsel and pushes when the organiser
// is away. A mail goes only when `notify` says `shouldAlsoSendMail`.

type AdminClient = ReturnType<typeof getAdminClient>;
type OrganizerKind = 'all_scorecards_delivered' | 'game_stale_reminder';

const MAIL_VARIANT: Record<OrganizerKind, 'all_delivered' | 'stale'> = {
  all_scorecards_delivered: 'all_delivered',
  game_stale_reminder: 'stale',
};

type RosterStamps = {
  submitted_at: string | null;
  approved_at: string | null;
  withdrawn_at: string | null;
};

/**
 * «Alle har levert» to the organiser, once, when a write has just made the
 * round ready to finish. Call it after any successful write that can do that:
 * a delivery, an approval, a withdrawal. `actorId` is whoever made the write.
 *
 * Nothing happens unless the game is active, the organiser messages apply to
 * it (`organizerNoticesApply`: not a cup match, not a derived game) and every
 * active card is in (`allDelivered`). Then the stamp is claimed. When the
 * organiser made the round ready themselves, the stamp is taken and nothing is
 * sent: they did it, and they are already on a page with «Avslutt spillet».
 * Taking the stamp keeps the message from arriving later for the same game.
 *
 * Best-effort: logs every failure and never throws, so the write that called
 * it always stands.
 */
export async function notifyOrganizerIfAllDelivered(
  gameId: string,
  actorId: string,
  logPrefix: string,
): Promise<void> {
  try {
    const admin = getAdminClient();
    const [gameRes, rosterRes] = await Promise.all([
      admin
        .from('games')
        .select('name, status, created_by, tournament_id, source_game_id, require_peer_approval')
        .eq('id', gameId)
        .maybeSingle<{
          name: string;
          status: string;
          created_by: string | null;
          tournament_id: string | null;
          source_game_id: string | null;
          require_peer_approval: boolean;
        }>(),
      admin
        .from('game_players')
        .select('submitted_at, approved_at, withdrawn_at')
        .eq('game_id', gameId)
        .returns<RosterStamps[]>(),
    ]);
    if (gameRes.error || rosterRes.error) {
      console.error(`[${logPrefix}] all_scorecards_delivered read failed`, {
        gameId,
        gameError: gameRes.error,
        rosterError: rosterRes.error,
      });
      return;
    }

    const game = gameRes.data;
    if (!game || game.status !== 'active' || !organizerNoticesApply(game)) return;
    if (!allDelivered(rosterRes.data ?? [], game.require_peer_approval)) return;
    const organizerId = game.created_by!;

    const { data: won, error: claimError } = await admin
      .from('games')
      .update({ organizer_all_delivered_notified_at: new Date().toISOString() })
      .eq('id', gameId)
      .is('organizer_all_delivered_notified_at', null)
      .eq('status', 'active')
      .select('id');
    if (claimError) {
      console.error(`[${logPrefix}] all_scorecards_delivered claim failed`, {
        gameId,
        error: claimError,
      });
      return;
    }
    if (!won || won.length === 0) return;
    if (actorId === organizerId) return;

    await sendOrganizerNotice(admin, {
      kind: 'all_scorecards_delivered',
      organizerId,
      game: { id: gameId, name: game.name },
      logPrefix,
    });
  } catch (err) {
    console.error(`[${logPrefix}] all_scorecards_delivered failed`, { gameId, err });
  }
}

/** The game the stale sweep hands over, read by the route. */
export type StaleSweepGame = {
  id: string;
  name: string;
  created_by: string | null;
  started_at: string | null;
};

const STALE_LOG_PREFIX = 'staleGameReminder';

/**
 * The stale reminder for one game (the hourly sweep, 0205): read the last
 * score and the roster's last delivery, approval and withdrawal, ask
 * `isStale`, and when the round has stood still for a day, claim the stamp and
 * send `game_stale_reminder` to the organiser.
 *
 * Throws on a failed read, so the route can catch and count it per game and
 * one game never costs the others their reminder (same as
 * `runDeliveryReminderSweepForGame`). The send itself is best-effort.
 */
export async function runStaleGameReminderForGame(
  admin: AdminClient,
  game: StaleSweepGame,
  now: number,
): Promise<{ reminded: boolean }> {
  if (game.created_by == null) return { reminded: false };

  const [scoreRes, rosterRes] = await Promise.all([
    admin
      .from('scores')
      .select('updated_at')
      .eq('game_id', game.id)
      .not('strokes', 'is', null)
      // DESC puts NULLs first in Postgres; a null would hide the newest score.
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .returns<{ updated_at: string | null }[]>(),
    admin
      .from('game_players')
      .select('submitted_at, approved_at, withdrawn_at')
      .eq('game_id', game.id)
      .returns<RosterStamps[]>(),
  ]);
  if (scoreRes.error) throw new Error(`${STALE_LOG_PREFIX} scores: ${scoreRes.error.message}`);
  if (rosterRes.error) throw new Error(`${STALE_LOG_PREFIX} roster: ${rosterRes.error.message}`);

  // Compared as instants, not as strings: PostgREST's fractional seconds vary.
  const rosterTimes = (rosterRes.data ?? [])
    .flatMap((r) => [r.submitted_at, r.approved_at, r.withdrawn_at])
    .filter((iso): iso is string => iso != null)
    .map((iso) => Date.parse(iso));
  const stale = isStale({
    startedAt: game.started_at,
    lastScoreAt: scoreRes.data?.[0]?.updated_at ?? null,
    lastRosterActivityAt:
      rosterTimes.length > 0 ? new Date(Math.max(...rosterTimes)).toISOString() : null,
    now,
  });
  if (!stale) return { reminded: false };

  const { data: won, error: claimError } = await admin
    .from('games')
    .update({ organizer_stale_reminder_sent_at: new Date(now).toISOString() })
    .eq('id', game.id)
    .is('organizer_stale_reminder_sent_at', null)
    .eq('status', 'active')
    .select('id');
  if (claimError) throw new Error(`${STALE_LOG_PREFIX} claim: ${claimError.message}`);
  if (!won || won.length === 0) return { reminded: false };

  await sendOrganizerNotice(admin, {
    kind: 'game_stale_reminder',
    organizerId: game.created_by,
    game: { id: game.id, name: game.name },
    logPrefix: STALE_LOG_PREFIX,
  });
  return { reminded: true };
}

/**
 * The varsel (in-app, push when away), then the mail when `notify` says the
 * organiser is off-app. Name and locale come from `users` with the admin
 * client, the address from `getPrivateUserFields`. The varsel never waits on
 * the `users` row. Best-effort: never throws.
 */
async function sendOrganizerNotice(
  admin: AdminClient,
  opts: {
    kind: OrganizerKind;
    organizerId: string;
    game: { id: string; name: string };
    logPrefix: string;
  },
): Promise<void> {
  const { kind, organizerId, game, logPrefix } = opts;
  let shouldMail = false;
  try {
    const r = await notify({
      userId: organizerId,
      kind,
      payload: { game_id: game.id, game_name: game.name },
    });
    shouldMail = r.shouldAlsoSendMail;
  } catch (err) {
    console.error(`[${logPrefix}] ${kind} notify failed`, { gameId: game.id, err });
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
      variant: MAIL_VARIANT[kind],
    });
  } catch (err) {
    console.error(`[${logPrefix}] ${kind} mail failed`, { gameId: game.id, err });
  }
}
