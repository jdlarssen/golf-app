import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getCaptainDisplayName,
  loadInviterTeams,
  pickCaptainRequest,
  pickPendingInvitation,
  type InviterTeams,
} from '@/app/[locale]/signup/[shortId]/team/captainLookup';
import type { Database } from '@/lib/database.types';
import { maybeAutoConfirmParticipation } from '@/lib/games/confirmParticipation';
import { expireGameCache } from '@/lib/games/expireGameCache';
import { getGameByShortId } from '@/lib/games/getGameByShortId';
import { joinTeeGenders } from '@/lib/games/joinTeeGenders';
import { acceptedAtForActor } from '@/lib/games/participantAcceptance';
import {
  addTeammateRow,
  checkTeammatesAreFriends,
  isDuplicateError,
  readProfileGate,
  resolveTeamSize,
  SHORT_ID_PATTERN,
  type AcceptDeclineResult,
} from '@/lib/games/teamRegistrationCore';
import { flightForTeam, type TeamPlayer } from '@/lib/games/teamScope';
import { markReadOnVisit } from '@/lib/notifications/markRead';
import { notify } from '@/lib/notifications/notify';
import { notifyInvitedToTeam } from '@/lib/notifications/notifyInvitedToTeam';
import { expectAffected } from '@/lib/supabase/affectedRows';
import { getAdminClient } from '@/lib/supabase/admin';
import { emailMatchPattern } from '@/lib/supabase/emailMatch';
import { displayNameForOthers } from '@/lib/users/displayName';

/**
 * The team page (`/signup/[shortId]/team`) and its actions, shared by the web
 * and the app's route (#2840). Reads and writes run on the service role, so the
 * ownership checks live here: only the team's current captain manages the
 * team, and a request or an invitation is only ever the caller's own.
 * `userId` comes from the verified session or token, never from a body.
 */

type RequestStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

/**
 * `attachToCaptainTeamCore` has one exit the other team actions do not:
 * `team_unknown` — the invitation is real, but we cannot tell which team it
 * belongs to (#1343).
 */
export type AttachTeamResult = AcceptDeclineResult | { ok: false; error: 'team_unknown' };

/**
 * #2358: the captain hands the captaincy to a teammate.
 */
export type TransferCaptaincyResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | 'not_authed'
        | 'not_found'
        | 'game_locked'
        | 'not_approved'
        /** #2607: a guest has no login and cannot be captain (0228). */
        | 'captain_is_guest'
        | 'db_error';
    };

export type AddTeamMemberError =
  | 'not_found'
  | 'game_locked'
  | 'signup_closed'
  /** #2840: every seat on the team is taken. */
  | 'team_full'
  | 'teammate_not_friend'
  | 'already_registered'
  | 'db_error';

export type AddTeamMemberResult =
  | {
      ok: true;
      /** With `replaceRequestId`: whether the old row is gone. */
      replaced?: boolean;
    }
  | { ok: false; error: AddTeamMemberError };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The child request and its captain row, when `userId` is that team's current
 * captain. After a captaincy transfer (#2358) `team_request_id` points at the
 * new captain, so the old one no longer manages the team; a captain who has
 * withdrawn does not either.
 */
async function loadOwnTeamChild(
  userId: string,
  childRequestId: string,
): Promise<{
  child: {
    id: string;
    game_id: string;
    user_id: string;
    team_request_id: string;
    team_name: string | null;
    status: string;
  };
  captainReq: { user_id: string; team_name: string | null; status: string };
} | null | 'db_error'> {
  const admin = getAdminClient();
  const { data: child, error: childError } = await admin
    .from('game_registration_requests')
    .select('id, game_id, user_id, team_request_id, team_name, status')
    .eq('id', childRequestId)
    .maybeSingle<{
      id: string;
      game_id: string;
      user_id: string;
      team_request_id: string | null;
      team_name: string | null;
      status: string;
    }>();
  // #2840: a failed read is not «not your team» (I3).
  if (childError) {
    console.error('[loadOwnTeamChild] teammate read failed', { childRequestId, childError });
    return 'db_error';
  }
  if (!child || !child.team_request_id) return null;

  const { data: captainReq, error: captainError } = await admin
    .from('game_registration_requests')
    .select('user_id, team_name, status')
    .eq('id', child.team_request_id)
    .maybeSingle<{ user_id: string; team_name: string | null; status: string }>();
  if (captainError) {
    console.error('[loadOwnTeamChild] captain read failed', { childRequestId, captainError });
    return 'db_error';
  }
  if (!captainReq || captainReq.user_id !== userId || captainReq.status === 'withdrawn') {
    return null;
  }
  return { child: { ...child, team_request_id: child.team_request_id }, captainReq };
}

/**
 * The captain removes a teammate before the start: the roster row and the
 * child request go, and the teammate is told.
 */
export async function removeTeamMemberCore(
  userId: string,
  input: { shortId: string; requestId: string },
): Promise<AcceptDeclineResult> {
  if (!SHORT_ID_PATTERN.test(input.shortId)) {
    return { ok: false, error: 'not_found' };
  }
  const own = await loadOwnTeamChild(userId, input.requestId);
  if (own === 'db_error') {
    return { ok: false, error: 'db_error' };
  }
  if (!own) {
    return { ok: false, error: 'not_found' };
  }
  const { child } = own;

  const game = await getGameByShortId(input.shortId);
  if (!game || game.id !== child.game_id) {
    return { ok: false, error: 'not_found' };
  }
  // #2445: a draft answers like a game that does not exist.
  if (game.status === 'draft') {
    return { ok: false, error: 'not_found' };
  }
  if (game.status !== 'scheduled') {
    return { ok: false, error: 'game_locked' };
  }

  const admin = getAdminClient();
  // #2223: the roster row goes first. A failed delete answers db_error with
  // the request still in place, so the captain can try again.
  const { error: deletePlayerError } = await admin
    .from('game_players')
    .delete()
    .eq('game_id', game.id)
    .eq('user_id', child.user_id);
  if (deletePlayerError) {
    console.error('[removeTeamMember] player delete failed', {
      gameId: game.id,
      userId: child.user_id,
      error: deletePlayerError,
    });
    return { ok: false, error: 'db_error' };
  }
  const { error: deleteReqError } = await admin
    .from('game_registration_requests')
    .delete()
    .eq('id', child.id);
  if (deleteReqError) {
    console.error('[removeTeamMember] request delete failed', deleteReqError);
    return { ok: false, error: 'db_error' };
  }

  await notify({
    userId: child.user_id,
    kind: 'registration_rejected',
    payload: {
      game_id: game.id,
      game_name: game.name,
      // App-generated reason → localised at render time via catalog (#583).
      reason_code: 'team_removed',
    },
  }).catch((err) => console.error('[removeTeamMember] notify failed', err));

  expireGameCache(game.id);
  return { ok: true };
}

/**
 * Sends the `team_invite` again to a teammate who has not answered.
 */
export async function resendTeamInviteCore(
  userId: string,
  input: { shortId: string; requestId: string },
): Promise<AcceptDeclineResult> {
  if (!SHORT_ID_PATTERN.test(input.shortId)) {
    return { ok: false, error: 'not_found' };
  }
  const own = await loadOwnTeamChild(userId, input.requestId);
  if (own === 'db_error') {
    return { ok: false, error: 'db_error' };
  }
  if (!own) {
    return { ok: false, error: 'not_found' };
  }
  const { child, captainReq } = own;

  const game = await getGameByShortId(input.shortId);
  if (!game || game.id !== child.game_id) {
    return { ok: false, error: 'not_found' };
  }
  // #2445: a draft answers like a game that does not exist — the push would
  // carry its name.
  if (game.status === 'draft') {
    return { ok: false, error: 'not_found' };
  }

  const captainName = await getCaptainDisplayName(userId);
  await notifyInvitedToTeam({
    recipientUserId: child.user_id,
    gameId: game.id,
    gameShortId: game.short_id,
    gameName: game.name,
    teamRequestId: child.team_request_id,
    teamName: captainReq.team_name ?? child.team_name,
    invitedByName: captainName,
  });

  return { ok: true };
}

/**
 * #2358: the move itself (who may do it, who may take it, which rows move)
 * lives in `transfer_team_captaincy` (0194), in one transaction. This is the
 * gate: it sends the REAL caller as the actor, because the function runs as the
 * service role and cannot read `auth.uid()`.
 */
export async function transferCaptaincyCore(
  userId: string,
  input: { shortId: string; requestId: string },
): Promise<TransferCaptaincyResult> {
  if (!SHORT_ID_PATTERN.test(input.shortId) || !UUID_PATTERN.test(input.requestId)) {
    return { ok: false, error: 'not_found' };
  }

  const game = await getGameByShortId(input.shortId);
  if (!game) {
    return { ok: false, error: 'not_found' };
  }
  // #2445: a draft answers like a game that does not exist.
  if (game.status === 'draft') {
    return { ok: false, error: 'not_found' };
  }

  const { data, error } = await getAdminClient().rpc('transfer_team_captaincy', {
    p_game_id: game.id,
    p_actor_user_id: userId,
    p_new_captain_request_id: input.requestId,
  });
  if (error) {
    console.error('[transferCaptaincy] rpc failed', { gameId: game.id, error });
    return { ok: false, error: 'db_error' };
  }

  const outcome = (data as { outcome?: string } | null)?.outcome;
  switch (outcome) {
    case 'ok':
      expireGameCache(game.id);
      return { ok: true };
    case 'game_locked':
      return { ok: false, error: 'game_locked' };
    case 'not_approved':
      return { ok: false, error: 'not_approved' };
    case 'new_captain_is_guest':
      return { ok: false, error: 'captain_is_guest' };
    // Not the caller's team to manage, or no team: the same answer the other
    // team actions give a stranger.
    case 'not_allowed':
    case 'not_a_teammate':
    case 'game_not_found':
      return { ok: false, error: 'not_found' };
    default:
      console.error('[transferCaptaincy] unexpected outcome', { gameId: game.id, data });
      return { ok: false, error: 'db_error' };
  }
}

/**
 * Chunk 9: someone invited by e-mail before #2840 logged in and opened the team
 * page. They have an open `invitations` row for the game but no request row
 * (the captain could not make one without a user id). This finds the captain
 * who invited them and makes the request row now.
 *
 * #2840: no friendship is required here. The invitation was sent before the
 * friends-only rule, and it is the captain's own choice of teammate.
 *
 * `ctx.userClient` carries the caller's auth: `befriend_inviter` is gated on
 * `auth.uid()` (the invitee).
 */
export async function attachToCaptainTeamCore(
  userId: string,
  input: { shortId: string; invitationId: string },
  ctx: { userClient: SupabaseClient<Database> },
): Promise<AttachTeamResult> {
  if (!SHORT_ID_PATTERN.test(input.shortId)) {
    return { ok: false, error: 'not_found' };
  }
  const profile = await readProfileGate(userId, 'attachToCaptainTeam');
  if (profile !== 'ok') return { ok: false, error: profile };
  const admin = getAdminClient();

  const game = await getGameByShortId(input.shortId);
  if (!game) {
    return { ok: false, error: 'not_found' };
  }
  // #2445: a draft answers like a game that does not exist.
  if (game.status === 'draft') {
    return { ok: false, error: 'not_found' };
  }
  if (game.status !== 'scheduled') {
    return { ok: false, error: 'game_locked' };
  }
  // #543: closed signups apply to e-mail-invited teammates too.
  if (game.signups_closed_at != null) {
    return { ok: false, error: 'signup_closed' };
  }

  // The invitation must be this user's (matching address). #1437: expiry is
  // enforced like the login gate (#1348); this also covers the window between
  // the page load and the tap.
  const { data: invitation } = await admin
    .from('invitations')
    .select('id, email, game_id, invited_by')
    .eq('id', input.invitationId)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle<{ id: string; email: string; game_id: string | null; invited_by: string }>();
  if (!invitation || invitation.game_id !== game.id) {
    return { ok: false, error: 'not_found' };
  }
  // The admin client skips RLS, so ownership is checked here.
  const { data: userRow } = await admin
    .from('users')
    .select('email')
    .eq('id', userId)
    .maybeSingle<{ email: string }>();
  if (!userRow?.email || userRow.email.toLowerCase() !== invitation.email.toLowerCase()) {
    return { ok: false, error: 'not_found' };
  }

  // Every active captain request in the game, newest first. pickCaptainRequest
  // chooses: the inviter wins when they are captain, otherwise it is a guess
  // (`source: 'fallback'`) and we stop below (#1343).
  const { data: captains } = await admin
    .from('game_registration_requests')
    .select('id, user_id, team_name, status')
    .eq('game_id', game.id)
    .eq('is_team_captain', true)
    .in('status', ['pending', 'approved'])
    .order('created_at', { ascending: false })
    .returns<{ id: string; user_id: string; team_name: string | null; status: RequestStatus }[]>();
  let picked = pickCaptainRequest(captains ?? [], invitation.invited_by);
  // #2358: the inviter may have handed the captaincy on since. The team map is
  // read only when the inviter is not captain themself.
  if (picked && picked.source !== 'invited_by') {
    const inviterTeams = await loadInviterTeams(
      admin,
      game.id,
      (captains ?? []).map((c) => c.id),
    );
    picked = pickCaptainRequest(captains ?? [], invitation.invited_by, inviterTeams);
  }
  if (!picked) {
    return { ok: false, error: 'not_found' };
  }
  // A guess is worse than no link: the player would stand on a stranger's
  // team. The page shows the same stop, but the guard stands here too — an old
  // tab can post the action whatever the page showed (#1343).
  if (picked.source !== 'invited_by') {
    return { ok: false, error: 'team_unknown' };
  }
  const captain = picked.row;

  // The captain's status: open mode means approved (in at once), manual
  // approval means pending (waits with the rest of the team).
  const childStatus = captain.status;
  const decidedAt = childStatus === 'approved' ? new Date().toISOString() : null;

  const { data: inserted, error: insertError } = await admin
    .from('game_registration_requests')
    .insert({
      game_id: game.id,
      user_id: userId,
      status: childStatus,
      team_name: captain.team_name,
      is_team_captain: false,
      team_request_id: captain.id,
      decided_at: decidedAt,
      decided_by_user_id: childStatus === 'approved' ? captain.user_id : null,
    })
    .select('id')
    .single<{ id: string }>();

  if (insertError) {
    if (isDuplicateError(insertError)) {
      // Already attached in a parallel tab: success.
      return { ok: true };
    }
    console.error('[attachToCaptainTeam] insert failed', insertError);
    return { ok: false, error: 'db_error' };
  }

  // Open mode: on the captain's team in game_players at once. A captain with
  // no team number gets no row for the teammate (#2061/#2072).
  //
  // #2223: a failed read or write rolls the child request back and answers
  // db_error before the invitation is consumed, so «Bli med på lag» is still
  // there for the next try.
  if (childStatus === 'approved') {
    const { data: captainPlayer, error: captainPlayerError } = await admin
      .from('game_players')
      .select('team_number, flight_number, withdrawn_at')
      .eq('game_id', game.id)
      .eq('user_id', captain.user_id)
      .maybeSingle<Omit<TeamPlayer, 'user_id'>>();
    if (captainPlayerError) {
      console.error('[attachToCaptainTeam] captain player lookup failed', {
        gameId: game.id,
        userId,
        captainUserId: captain.user_id,
        error: captainPlayerError,
      });
      await rollbackAttachRequest(inserted.id);
      return { ok: false, error: 'db_error' };
    }
    const teamNumber = captainPlayer?.team_number ?? null;

    if (teamNumber === null) {
      console.error('[attachToCaptainTeam] captain has no team number', {
        gameId: game.id,
        userId,
        captainUserId: captain.user_id,
      });
    } else {
      // #2209: the player's tee category from the profile, clamped to the tee.
      const teeGenders = await joinTeeGenders(game.id, [userId]);
      const { error: playerError } = await admin.from('game_players').upsert(
        {
          game_id: game.id,
          user_id: userId,
          team_number: teamNumber,
          // #2290: the flight follows the team (the captain's in best ball).
          flight_number: flightForTeam(
            game.game_mode,
            [{ ...captainPlayer!, user_id: captain.user_id }],
            userId,
            teamNumber,
          ),
          course_handicap: null,
          // #463: the user joins a team themself, so confirmed at once.
          accepted_at: acceptedAtForActor(userId, userId),
          tee_gender: teeGenders[userId],
        },
        { onConflict: 'game_id,user_id', ignoreDuplicates: true },
      );
      if (playerError) {
        console.error('[attachToCaptainTeam] player upsert failed', {
          gameId: game.id,
          userId,
          error: playerError,
        });
        await rollbackAttachRequest(inserted.id);
        return { ok: false, error: 'db_error' };
      }
    }
  }

  // Mark the invitation accepted. The player is on the team by now, so a
  // failed flip is only logged.
  const { error: acceptError } = await admin
    .from('invitations')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invitation.id);
  if (acceptError) {
    console.error('[attachToCaptainTeam] invitation accept failed', {
      invitationId: invitation.id,
      error: acceptError,
    });
  }

  // #481/#676: befriend the inviter. For team-scoped games the invitation is
  // still pending at login, so befriend_inviter no-ops in verifyCode; it fires
  // here, after accepted_at above. Gated on auth.uid() (the invitee), so it
  // runs with the caller's client, never admin. Best effort.
  if (invitation.invited_by !== userId) {
    const { error: befriendError } = await ctx.userClient.rpc('befriend_inviter', {
      p_inviter: invitation.invited_by,
    });
    if (befriendError) {
      console.error('[attachToCaptainTeam] befriend_inviter failed', befriendError);
    }
  }

  await notify({
    userId: captain.user_id,
    kind: 'registration_approved',
    payload: { game_id: game.id, game_name: game.name },
  }).catch((err) => console.error('[attachToCaptainTeam] notify failed', err));

  expireGameCache(game.id);
  return { ok: true };
}

/**
 * Compensation for attachToCaptainTeamCore (#2223): drops the child request it
 * just inserted when the roster step failed. A failed rollback is logged and
 * never thrown out.
 */
async function rollbackAttachRequest(requestId: string): Promise<void> {
  try {
    expectAffected(
      await getAdminClient()
        .from('game_registration_requests')
        .delete()
        .eq('id', requestId)
        .select('id'),
      'attachToCaptainTeam',
    );
  } catch (rollbackErr) {
    console.error('[attachToCaptainTeam] request rollback failed', rollbackErr);
  }
}

/**
 * #2840: the captain fills a free seat on their team with a friend, or swaps a
 * teammate who said no (`replaceRequestId`, a child row that is rejected or
 * withdrawn) for one. The teammate is written exactly as in the team submit
 * (`addTeammateRow`).
 */
export async function addTeamMemberCore(
  userId: string,
  input: { shortId: string; friendId: string; replaceRequestId?: string | null },
): Promise<AddTeamMemberResult> {
  const { shortId } = input;
  const friendId = String(input.friendId ?? '');
  const replaceRequestId = input.replaceRequestId ? String(input.replaceRequestId) : null;
  if (!SHORT_ID_PATTERN.test(shortId)) {
    return { ok: false, error: 'not_found' };
  }
  if (replaceRequestId !== null && !UUID_PATTERN.test(replaceRequestId)) {
    return { ok: false, error: 'not_found' };
  }
  if (!UUID_PATTERN.test(friendId)) {
    return { ok: false, error: 'teammate_not_friend' };
  }

  const game = await getGameByShortId(shortId);
  // #2445: a draft answers like a game that does not exist.
  if (!game || game.status === 'draft') {
    return { ok: false, error: 'not_found' };
  }
  const admin = getAdminClient();

  // The caller's own active captain row in this game.
  const { data: captainReq, error: captainError } = await admin
    .from('game_registration_requests')
    .select('id, status, team_name')
    .eq('game_id', game.id)
    .eq('user_id', userId)
    .eq('is_team_captain', true)
    .maybeSingle<{ id: string; status: RequestStatus; team_name: string | null }>();
  if (captainError) {
    console.error('[addTeamMember] captain lookup failed', { gameId: game.id, error: captainError });
    return { ok: false, error: 'db_error' };
  }
  if (!captainReq || (captainReq.status !== 'pending' && captainReq.status !== 'approved')) {
    return { ok: false, error: 'not_found' };
  }

  if (game.status !== 'scheduled') {
    return { ok: false, error: 'game_locked' };
  }
  if (game.signups_closed_at != null) {
    return { ok: false, error: 'signup_closed' };
  }
  const teamSize = resolveTeamSize(game.mode_config);
  if (teamSize === null) {
    return { ok: false, error: 'not_found' };
  }

  const { data: children, error: childrenError } = await admin
    .from('game_registration_requests')
    .select('id, user_id, status')
    .eq('game_id', game.id)
    .eq('team_request_id', captainReq.id)
    .returns<{ id: string; user_id: string; status: RequestStatus }[]>();
  if (childrenError) {
    console.error('[addTeamMember] team lookup failed', { gameId: game.id, error: childrenError });
    return { ok: false, error: 'db_error' };
  }
  const team = children ?? [];
  if (
    replaceRequestId !== null &&
    !team.some(
      (c) =>
        c.id === replaceRequestId && (c.status === 'rejected' || c.status === 'withdrawn'),
    )
  ) {
    return { ok: false, error: 'not_found' };
  }
  // A row being replaced is rejected or withdrawn, so it never holds a seat.
  const taken = team.filter((c) => c.status === 'pending' || c.status === 'approved').length;
  if (taken >= teamSize - 1) {
    return { ok: false, error: 'team_full' };
  }

  if (friendId === userId) {
    return { ok: false, error: 'already_registered' };
  }
  const friendCheck = await checkTeammatesAreFriends(userId, [friendId], 'addTeamMember');
  if (friendCheck !== 'ok') {
    return { ok: false, error: friendCheck };
  }

  // Not in this round already: a request of any status (unique per game and
  // user), or a roster row the organiser added.
  const [{ data: existingReq, error: existingReqError }, { data: existingPlayer, error: existingPlayerError }] =
    await Promise.all([
      admin
        .from('game_registration_requests')
        .select('id')
        .eq('game_id', game.id)
        .eq('user_id', friendId)
        .maybeSingle<{ id: string }>(),
      admin
        .from('game_players')
        .select('user_id')
        .eq('game_id', game.id)
        .eq('user_id', friendId)
        .maybeSingle<{ user_id: string }>(),
    ]);
  if (existingReqError || existingPlayerError) {
    console.error('[addTeamMember] registration lookup failed', {
      gameId: game.id,
      error: existingReqError ?? existingPlayerError,
    });
    return { ok: false, error: 'db_error' };
  }
  if (existingReq || existingPlayer) {
    return { ok: false, error: 'already_registered' };
  }

  // The captain's team and flight. ASSUMPTION (#2840): the roster row follows
  // the captain whenever the captain is approved with a team number — the same
  // rule as acceptTeamInvite — so an approved teammate is never left without
  // a roster row.
  let teamNumber: number | null = null;
  let flightNumber: number | null = null;
  if (captainReq.status === 'approved') {
    const { data: captainPlayer, error: captainPlayerError } = await admin
      .from('game_players')
      .select('team_number, flight_number, withdrawn_at')
      .eq('game_id', game.id)
      .eq('user_id', userId)
      .maybeSingle<Omit<TeamPlayer, 'user_id'>>();
    if (captainPlayerError) {
      console.error('[addTeamMember] captain player lookup failed', {
        gameId: game.id,
        error: captainPlayerError,
      });
      return { ok: false, error: 'db_error' };
    }
    teamNumber = captainPlayer?.team_number ?? null;
    if (teamNumber !== null) {
      flightNumber = flightForTeam(
        game.game_mode,
        [{ ...captainPlayer!, user_id: userId }],
        friendId,
        teamNumber,
      );
    }
  }

  const captainName = await getCaptainDisplayName(userId);
  const slot = await addTeammateRow({
    game,
    captainId: userId,
    captainName,
    captainRequestId: captainReq.id,
    captainStatus: captainReq.status,
    teamName: captainReq.team_name,
    memberId: friendId,
    teamNumber,
    flightNumber,
    context: 'addTeamMember',
  });
  if (!slot.ok) {
    return {
      ok: false,
      error: slot.reason === 'alreadyRegistered' ? 'already_registered' : 'db_error',
    };
  }

  let replaced: boolean | undefined;
  if (replaceRequestId !== null) {
    try {
      expectAffected(
        await admin
          .from('game_registration_requests')
          .delete()
          .eq('id', replaceRequestId)
          .eq('team_request_id', captainReq.id)
          .select('id'),
        'addTeamMember',
      );
      replaced = true;
    } catch (deleteErr) {
      // The new teammate is in. The old row is rejected or withdrawn and holds
      // no seat, so the answer is ok, with the miss said out loud.
      console.error('[addTeamMember] old row delete failed', deleteErr);
      replaced = false;
    }
  }

  expireGameCache(game.id);
  return replaced === undefined ? { ok: true } : { ok: true, replaced };
}

/**
 * Opening the team page (#2201, #2759): confirms a seat the captain gave you
 * (#463), then marks the game's team varsler read. The web page runs the same
 * two calls in `after()`; the app's route calls this.
 */
export async function onTeamPageVisit(gameId: string, userId: string): Promise<void> {
  await maybeAutoConfirmParticipation({ gameId, userId });
  await markReadOnVisit({ userId, surface: 'teamSignup', entityId: gameId });
}

export type TeamDashboardPerson = {
  requestId: string;
  userId: string;
  /** Name, or the masked address (#2207); null when the user row is missing. */
  displayName: string | null;
  status: RequestStatus;
};

export type TeamDashboardMember = TeamDashboardPerson & {
  /** #2607: no captaincy for a guest; an unknown user reads as a guest. */
  isGuest: boolean;
};

export type TeamDashboardGame = {
  id: string;
  shortId: string;
  name: string;
  courseName: string | null;
  /** open → straight into the game; otherwise the team waits for approval (#362). */
  joinEffect: 'instant' | 'approval';
  /** #543: signups closed while the game is still scheduled. */
  signupsClosed: boolean;
};

export type TeamDashboardView =
  | { kind: 'not_found' }
  | { kind: 'no_team'; game: TeamDashboardGame }
  /** An e-mail invitation whose team we cannot tell (#1343). */
  | { kind: 'team_unknown'; game: TeamDashboardGame; noCaptain: boolean }
  | {
      kind: 'invited_unknown';
      game: TeamDashboardGame;
      invitationId: string;
      captainName: string | null;
      teamName: string | null;
    }
  /** A solo request; it does not belong on the team page. */
  | { kind: 'solo'; game: TeamDashboardGame }
  | {
      kind: 'captain' | 'member';
      game: TeamDashboardGame;
      myRowId: string;
      myStatus: RequestStatus;
      /** The captain's team name, else the caller's; null = none. */
      teamName: string | null;
      captain: TeamDashboardPerson | null;
      members: TeamDashboardMember[];
    };

type TeamMemberRow = {
  id: string;
  user_id: string;
  status: RequestStatus;
  is_team_captain: boolean;
  team_name: string | null;
  team_request_id: string | null;
};

type CaptainRequestRow = {
  id: string;
  user_id: string;
  team_name: string | null;
  status: RequestStatus;
};

/**
 * #2840: a failed read must not look like «no team» (I3, #877). The page's
 * error boundary and the app route's 500 take it from here. The display-name
 * read further down stays best effort, as it always was.
 */
function throwRead(what: string, error: { message?: string }): never {
  throw new Error(`[loadTeamDashboard] ${what} read failed: ${error.message ?? 'unknown'}`);
}

/**
 * The team page's read (#199 chunks 8+9). Three roles share it:
 *   - captain: every teammate with a status;
 *   - member: the team and the caller's own answer;
 *   - invited_unknown: someone invited by e-mail who has no request row yet,
 *     offered «Bli med på lag» when we know which team it is.
 */
export async function loadTeamDashboard(
  shortId: string,
  userId: string,
): Promise<TeamDashboardView> {
  const game = await getGameByShortId(shortId);
  // #2445: a draft answers like a game that does not exist, for everyone.
  if (!game || game.status === 'draft') {
    return { kind: 'not_found' };
  }
  const view: TeamDashboardGame = {
    id: game.id,
    shortId: game.short_id,
    name: game.name,
    courseName: game.courses?.name ?? null,
    joinEffect: game.registration_mode === 'open' ? 'instant' : 'approval',
    signupsClosed: game.signups_closed_at != null && game.status === 'scheduled',
  };

  const admin = getAdminClient();

  // The caller's own row decides the role.
  const { data: myRow, error: myRowError } = await admin
    .from('game_registration_requests')
    .select('id, user_id, status, is_team_captain, team_name, team_request_id')
    .eq('game_id', game.id)
    .eq('user_id', userId)
    .maybeSingle<TeamMemberRow>();
  if (myRowError) throwRead('own row', myRowError);

  if (!myRow) {
    // No request row: an open invitation for the game may offer «Bli med».
    const { data: userRow, error: userError } = await admin
      .from('users')
      .select('email')
      .eq('id', userId)
      .maybeSingle<{ email: string }>();
    if (userError) throwRead('own e-mail', userError);
    if (!userRow?.email) return { kind: 'no_team', game: view };

    // No unique on (email, game_id): both the organiser and a captain may have
    // invited the same address, so read every open one and let
    // pickPendingInvitation choose (#1343). #1437: unexpired only.
    const { data: invitations, error: invitationsError } = await admin
      .from('invitations')
      .select('id, email, invited_by')
      .filter('email', 'imatch', emailMatchPattern(userRow.email))
      .eq('game_id', game.id)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .returns<{ id: string; email: string; invited_by: string }[]>();
    if (invitationsError) throwRead('invitations', invitationsError);
    if (!invitations || invitations.length === 0) return { kind: 'no_team', game: view };

    // The captain rows decide which invitation is a certain team match, so
    // they are read before the invitation is picked (#1343).
    const { data: captains, error: captainsError } = await admin
      .from('game_registration_requests')
      .select('id, user_id, team_name, status')
      .eq('game_id', game.id)
      .eq('is_team_captain', true)
      .in('status', ['pending', 'approved'])
      .order('created_at', { ascending: false })
      .returns<CaptainRequestRow[]>();
    if (captainsError) throwRead('captain rows', captainsError);
    const captainRows = captains ?? [];
    // #2358: a captain who handed on the captaincy is still on the team.
    const inviterTeams: InviterTeams = await loadInviterTeams(
      admin,
      game.id,
      captainRows.map((r) => r.id),
    );
    const pendingInvitation = pickPendingInvitation(invitations, [
      ...captainRows.map((r) => r.user_id),
      ...inviterTeams.keys(),
    ]);
    if (!pendingInvitation) return { kind: 'no_team', game: view };

    // Only when we KNOW the team: the inviter is captain in the game (#1343).
    const picked = pickCaptainRequest(captainRows, pendingInvitation.invited_by, inviterTeams);
    if (picked?.source !== 'invited_by') {
      return { kind: 'team_unknown', game: view, noCaptain: picked === null };
    }
    return {
      kind: 'invited_unknown',
      game: view,
      invitationId: pendingInvitation.id,
      captainName: await getCaptainDisplayName(picked.row.user_id),
      teamName: picked.row.team_name,
    };
  }

  const captainRequestId = myRow.is_team_captain ? myRow.id : myRow.team_request_id;
  if (!captainRequestId) {
    return { kind: 'solo', game: view };
  }

  const { data: allRows, error: allRowsError } = await admin
    .from('game_registration_requests')
    .select('id, user_id, status, is_team_captain, team_name, team_request_id')
    .or(`id.eq.${captainRequestId},team_request_id.eq.${captainRequestId}`)
    .returns<TeamMemberRow[]>();
  if (allRowsError) throwRead('team rows', allRowsError);
  const rows = allRows ?? [];
  const captainRow = rows.find((r) => r.is_team_captain);
  const memberRows = rows.filter((r) => !r.is_team_captain);

  // Display names, best effort. #2207: a teammate without a name shows as the
  // masked address — the full one never leaves the server.
  const { data: userRows } = await admin
    .from('users')
    .select('id, name, email, nickname, is_guest')
    .in(
      'id',
      rows.map((r) => r.user_id),
    )
    .returns<
      { id: string; name: string | null; email: string; nickname: string | null; is_guest: boolean }[]
    >();
  const usersById = new Map(
    (userRows ?? []).map((u) => [
      u.id,
      {
        name: displayNameForOthers({ name: u.name, email: u.email }) ?? '',
        isGuest: u.is_guest,
      },
    ]),
  );

  return {
    kind: myRow.is_team_captain ? 'captain' : 'member',
    game: view,
    myRowId: myRow.id,
    myStatus: myRow.status,
    teamName: captainRow?.team_name ?? myRow.team_name ?? null,
    captain: captainRow
      ? {
          requestId: captainRow.id,
          userId: captainRow.user_id,
          displayName: usersById.get(captainRow.user_id)?.name ?? null,
          status: captainRow.status,
        }
      : null,
    members: memberRows.map((r) => ({
      requestId: r.id,
      userId: r.user_id,
      displayName: usersById.get(r.user_id)?.name ?? null,
      status: r.status,
      isGuest: usersById.get(r.user_id)?.isGuest ?? true,
    })),
  };
}
