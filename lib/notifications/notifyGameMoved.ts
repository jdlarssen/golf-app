import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { findGuestIds } from '@/lib/games/createGuestPlayer';
import { gameMovedRecipients, type GameMovedRosterRow } from '@/lib/games/gameMovedRecipients';
import { firstName } from '@/lib/firstName';
import { displayNameForOthers } from '@/lib/users/displayName';
import { getPrivateUserFields } from '@/lib/users/privateUserFields';
import { sendGameMovedNotification } from '@/lib/mail/gameMovedNotification';
import { playerTeeOff, type TeeTimePlayer, type TeeTimeRound } from '@/lib/games/flightTeeTimes';
import { expectedTeamSize } from '@/lib/games/teamScope';
import type { GameMode } from '@/lib/scoring/modes/types';
import { inboxPerson } from './inboxSections';
import { notify } from './notify';

// «Flytt runden» (#2480): the roster hears that a scheduled round has a new
// time. Who is told is the pure rule in `lib/games/gameMovedRecipients.ts`;
// this file reads the roster, sends, and gives the page its name line.
//
// In the app first: `notify` stores the varsel and pushes when the player is
// away. A mail goes only when `notify` says `shouldAlsoSendMail` (the owner's
// answer 2026-10-29).
//
// **Authz lies with the caller**, as in `notifyRosterInvites`: the module
// reads and sends with the admin client and never asks who calls. The move
// action gates with `requireAdminOrCreator` and the edit action with its own
// gate, and `actorUserId` must be the real caller: it is the name in the
// varsel and the one who is never told.

type AdminClient = ReturnType<typeof getAdminClient>;

export type GameMovedRecipient = { userId: string; shortName: string | null };

type UserNameRow = { id: string; name: string | null; nickname: string | null; email: string | null };

type MovedGameRow = {
  name: string;
  created_by: string | null;
  game_mode: GameMode;
  mode_config: { team_size?: number } | null;
  tee_interval_minutes: number | null;
};

type MovedRosterRow = GameMovedRosterRow & Omit<TeeTimePlayer, 'user_id' | 'withdrawn_at'>;

/**
 * The game's name and who would be told if it moved now, with the short name
 * each one has in the inbox («Marte», or a masked address). The page shows
 * the names; `notifyGameMoved` sends to the same list. Throws on a failed
 * read: an unread roster is not «nobody to tell».
 */
export async function loadGameMovedRecipients(params: {
  gameId: string;
  actorUserId: string;
  excludeUserIds?: readonly string[];
}): Promise<{
  gameName: string;
  recipients: GameMovedRecipient[];
  /** #2451: the round without its tee-off, for each player's own start time. */
  round: Omit<TeeTimeRound<MovedRosterRow>, 'scheduled_tee_off_at'>;
} | null> {
  const admin = getAdminClient();
  const [gameRes, rosterRes] = await Promise.all([
    admin
      .from('games')
      .select('name, created_by, game_mode, mode_config, tee_interval_minutes')
      .eq('id', params.gameId)
      .maybeSingle<MovedGameRow>(),
    admin
      .from('game_players')
      .select('user_id, withdrawn_at, flight_number, team_number')
      .eq('game_id', params.gameId)
      .returns<MovedRosterRow[]>(),
  ]);
  if (gameRes.error) throw gameRes.error;
  if (rosterRes.error) throw rosterRes.error;
  if (!gameRes.data) return null;

  const roster = rosterRes.data ?? [];
  const createdBy = gameRes.data.created_by;
  const everyone = [...roster.map((r) => r.user_id), ...(createdBy ? [createdBy] : [])];
  const ids = gameMovedRecipients({
    roster,
    guestIds: await findGuestIds(everyone),
    actorUserId: params.actorUserId,
    createdBy,
    excludeIds: new Set(params.excludeUserIds ?? []),
  });

  const names = await readNames(admin, ids);
  return {
    gameName: gameRes.data.name,
    recipients: ids.map((userId) => ({
      userId,
      shortName: inboxPerson(displayNameForOthers(names.get(userId) ?? noName))?.short ?? null,
    })),
    round: {
      game_mode: gameRes.data.game_mode,
      team_size: expectedTeamSize(gameRes.data.mode_config),
      tee_interval_minutes: gameRes.data.tee_interval_minutes,
      players: roster,
    },
  };
}

/**
 * #2451: the player's own start time at the new tee-off, when it is not the
 * tee-off itself (a later flight), else `undefined`. One varsel then says both,
 * and no `tee_time_changed` goes out on top.
 */
function ownTeeOffAt(
  round: Omit<TeeTimeRound<MovedRosterRow>, 'scheduled_tee_off_at'>,
  userId: string,
  teeOffAt: string,
): string | undefined {
  const row = round.players.find((p) => p.user_id === userId);
  if (!row) return undefined;
  const own = playerTeeOff({ ...round, scheduled_tee_off_at: teeOffAt }, row);
  if (!own || new Date(own.teeOffAt).getTime() === new Date(teeOffAt).getTime()) return undefined;
  return own.teeOffAt;
}

/**
 * One `game_moved` to each player who should hear that the round moved, and a
 * mail to those who are away. Older unread `game_moved` rows for the same game
 * and player are marked read first, so the inbox never shows the old time on
 * top. Returns the players whose `notify` call did not throw, for the
 * confirmation. `notify` swallows a failed insert itself, so the list means
 * «sent to», not «delivered».
 *
 * Best-effort: logs every failure with `[notifyGameMoved]` and never throws,
 * so the move that called it always stands.
 */
export async function notifyGameMoved(params: {
  gameId: string;
  actorUserId: string;
  /** The new tee-off, ISO. */
  teeOffAt: string;
  courseChanged: boolean;
  /** Players added in the same save («Rediger»): they get their invite instead. */
  excludeUserIds?: readonly string[];
}): Promise<{ notified: GameMovedRecipient[] }> {
  const { gameId, actorUserId, teeOffAt, courseChanged } = params;
  try {
    const loaded = await loadGameMovedRecipients(params);
    if (!loaded || loaded.recipients.length === 0) return { notified: [] };
    const { gameName, recipients, round } = loaded;
    const ids = recipients.map((r) => r.userId);

    const admin = getAdminClient();
    const actor = (await readNames(admin, [actorUserId])).get(actorUserId);
    const movedByName = actor ? displayNameForOthers(actor) : null;

    const { error: readError } = await admin
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('kind', 'game_moved')
      .eq('payload->>game_id', gameId)
      .in('user_id', ids)
      .is('read_at', null);
    if (readError) {
      console.error('[notifyGameMoved] marking older moves read failed', { gameId, error: readError });
    }

    const results = await Promise.allSettled(
      ids.map((userId) => {
        const own = ownTeeOffAt(round, userId, teeOffAt);
        return notify({
          userId,
          kind: 'game_moved',
          payload: {
            game_id: gameId,
            game_name: gameName,
            tee_off_at: teeOffAt,
            course_changed: courseChanged,
            moved_by_name: movedByName,
            ...(own ? { own_tee_off_at: own } : {}),
          },
        });
      }),
    );
    const mailIds: string[] = [];
    const notified: GameMovedRecipient[] = [];
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error('[notifyGameMoved] notify failed', { gameId, userId: ids[i], error: r.reason });
        return;
      }
      notified.push(recipients[i]);
      if (r.value.shouldAlsoSendMail) mailIds.push(ids[i]);
    });

    await sendMails(admin, { gameId, gameName, teeOffAt, courseChanged, userIds: mailIds });
    return { notified };
  } catch (err) {
    console.error('[notifyGameMoved] failed', { gameId, err });
    return { notified: [] };
  }
}

const noName: Omit<UserNameRow, 'id'> = { name: null, nickname: null, email: null };

async function readNames(admin: AdminClient, ids: readonly string[]): Promise<Map<string, UserNameRow>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await admin
    .from('users')
    .select('id, name, nickname, email')
    .in('id', [...ids])
    .returns<UserNameRow[]>();
  if (error) throw error;
  return new Map((data ?? []).map((u) => [u.id, u]));
}

/** The mail to the players who are away. Best-effort, per player. */
async function sendMails(
  admin: AdminClient,
  opts: { gameId: string; gameName: string; teeOffAt: string; courseChanged: boolean; userIds: string[] },
): Promise<void> {
  if (opts.userIds.length === 0) return;
  try {
    const [usersRes, privateFields] = await Promise.all([
      admin
        .from('users')
        .select('id, name, locale')
        .in('id', opts.userIds)
        .returns<{ id: string; name: string | null; locale: string | null }[]>(),
      getPrivateUserFields(opts.userIds),
    ]);
    if (usersRes.error) throw usersRes.error;
    const users = new Map((usersRes.data ?? []).map((u) => [u.id, u]));

    const results = await Promise.allSettled(
      opts.userIds.map(async (userId) => {
        const email = privateFields.get(userId)?.email;
        if (!email) return;
        const user = users.get(userId);
        await sendGameMovedNotification({
          to: email,
          recipientFirstName: firstName(user?.name ?? null),
          gameName: opts.gameName,
          gameId: opts.gameId,
          teeOffAt: opts.teeOffAt,
          courseChanged: opts.courseChanged,
          locale: user?.locale ?? null,
        });
      }),
    );
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error('[notifyGameMoved] mail failed', {
          gameId: opts.gameId,
          userId: opts.userIds[i],
          error: r.reason,
        });
      }
    });
  } catch (err) {
    console.error('[notifyGameMoved] mail read failed', { gameId: opts.gameId, err });
  }
}
