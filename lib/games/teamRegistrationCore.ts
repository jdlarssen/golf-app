import 'server-only';
import {
  getCaptainDisplayName,
} from '@/app/[locale]/signup/[shortId]/team/captainLookup';
import { consumeRegistrationRateLimit } from '@/lib/auth/registrationRateLimit';
import { readFriendIds } from '@/lib/friends/getFriendIds';
import { expireGameCache } from '@/lib/games/expireGameCache';
import { getGameByShortId } from '@/lib/games/getGameByShortId';
import { joinTeeGenders } from '@/lib/games/joinTeeGenders';
import { acceptedAtForActor } from '@/lib/games/participantAcceptance';
import {
  gameModeSupportsTeams,
  TEAM_NAME_MAX,
  TEAM_NAME_MIN,
} from '@/lib/games/registration';
import { maxTeamsForSize, teamModePlayerCap } from '@/lib/games/teamFormatLimits';
import { flightForTeam, type TeamPlayer } from '@/lib/games/teamScope';
import { notify } from '@/lib/notifications/notify';
import { notifyInvitedToTeam } from '@/lib/notifications/notifyInvitedToTeam';
import { expectAffected } from '@/lib/supabase/affectedRows';
import { getAdminClient } from '@/lib/supabase/admin';

/**
 * Team registration (#199 chunks 8+9), shared by the web actions in
 * `app/[locale]/signup/[shortId]/teamActions.ts` and the app's routes (#2840).
 *
 * The captain names the team and picks N−1 teammates. A teammate is always a
 * friend of the captain (#2840, owner's choice): the members arrive as user ids
 * and every one of them must be in the captain's accepted friendships before
 * anything is written. A typed address and the team invitation mail are gone
 * from this flow; an `invitations` row sent before #2840 still attaches through
 * `attachToCaptainTeamCore`.
 *
 * Writes go through the service role, so the gates here are the enforcement.
 * `userId` must come from the caller's verified session or token, never from a
 * form or a body. The callers keep what is theirs: redirects, the honeypot and
 * `getClientIp` on the web, the token and the status codes in a route.
 *
 *   1. Captain row in `game_registration_requests` (`is_team_captain = true`).
 *   2. Open mode: `claim_open_registration_seat` gives the captain a seat and a
 *      team number, or the captain row is rolled back.
 *   3. Per teammate: a child request with the captain's status, and in open
 *      mode a `game_players` row on the captain's team (rolled back on failure).
 *      A failed teammate does not undo the rest: the captain gets a team with
 *      an open seat and the per-slot result.
 */

/** Short ids are eight lowercase letters or digits. */
export const SHORT_ID_PATTERN = /^[0-9a-z]{8}$/;

/**
 * Slot failure codes. Rendered via `signup.slotFailReason.*` on the call site;
 * the core returns the code, not a translated string.
 */
export type TeamSlotFailReason = 'alreadyRegistered' | 'dbError' | 'unexpected';

/** One result per picked teammate, keyed on the user id the captain sent. */
export type TeamSlotResult =
  | { ok: true; outcome: 'known_added'; userId: string }
  | { ok: false; userId: string; reason: TeamSlotFailReason };

export type TeamRegistrationError =
  | 'not_authed'
  | 'profile_incomplete'
  | 'game_not_found'
  | 'wrong_type'
  | 'wrong_mode'
  | 'game_locked'
  | 'signup_closed'
  | 'mode_does_not_support_teams'
  | 'team_name_invalid'
  | 'slots_count_wrong'
  /** #2840: the same friend picked for two seats. */
  | 'duplicate_members'
  | 'self_in_slots'
  /** #2840: a teammate who is not the captain's friend (or no such user). */
  | 'teammate_not_friend'
  | 'already_registered'
  | 'rate_limited'
  | 'game_full'
  | 'db_error';

export type TeamRegistrationResult =
  | { ok: true; captainRequestId: string; slotResults: TeamSlotResult[] }
  | { ok: false; error: TeamRegistrationError };

export type AcceptDeclineError =
  | 'not_authed'
  | 'profile_incomplete'
  | 'not_found'
  | 'game_locked'
  | 'signup_closed'
  | 'db_error';

export type AcceptDeclineResult = { ok: true } | { ok: false; error: AcceptDeclineError };

/**
 * UNIQUE violation (23505), or «duplicate» in the message (mocks, older
 * PostgREST). Same check as `selfRegistration.ts`.
 */
export function isDuplicateError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === '23505') return true;
  return String(err.message ?? '')
    .toLowerCase()
    .includes('duplicate');
}

/**
 * Team size from `mode_config`: Texas scramble has `team_size: 2 | 3 | 4`, best
 * ball `team_size: 2`. Null when the mode has no teams.
 */
export function resolveTeamSize(
  modeConfig: { team_size?: number } | null | undefined,
): number | null {
  if (!modeConfig) return null;
  const size = modeConfig.team_size;
  if (typeof size !== 'number' || size < 2) return null;
  return size;
}

/**
 * The profile gate the web action used to redirect on. A failed read answers
 * `db_error`, never «no profile» (#1863).
 */
export async function readProfileGate(
  userId: string,
  context: string,
): Promise<'ok' | 'profile_incomplete' | 'db_error'> {
  const { data, error } = await getAdminClient()
    .from('users')
    .select('profile_completed_at')
    .eq('id', userId)
    .maybeSingle<{ profile_completed_at: string | null }>();
  if (error) {
    console.error(`[${context}] profile lookup failed`, { userId, error });
    return 'db_error';
  }
  return data?.profile_completed_at ? 'ok' : 'profile_incomplete';
}

/**
 * #2840: the teammate rule's one home. Every id must be an accepted friend of
 * the captain and a live account. A deleted account is filtered the way
 * `getTeamCandidates` does it (`deleted_at is null`, #1012), and reads as «not a
 * friend you can pick». A failed read throws nothing out: it answers
 * `db_error`, so «we don't know» never reads as «friend» or «not a friend».
 */
export async function checkTeammatesAreFriends(
  captainId: string,
  memberIds: readonly string[],
  context: string,
): Promise<'ok' | 'teammate_not_friend' | 'db_error'> {
  if (memberIds.length === 0) return 'ok';
  let friendIds: string[];
  try {
    friendIds = await readFriendIds(captainId);
  } catch (err) {
    console.error(`[${context}] friend lookup failed`, { captainId, err });
    return 'db_error';
  }
  const friends = new Set(friendIds);
  if (memberIds.some((id) => !friends.has(id))) return 'teammate_not_friend';

  const { data, error } = await getAdminClient()
    .from('users')
    .select('id')
    .in('id', [...memberIds])
    .is('deleted_at', null)
    .returns<{ id: string }[]>();
  if (error) {
    console.error(`[${context}] teammate lookup failed`, { captainId, error });
    return 'db_error';
  }
  const live = new Set((data ?? []).map((u) => u.id));
  return memberIds.every((id) => live.has(id)) ? 'ok' : 'teammate_not_friend';
}

/**
 * The captain submits the team. A failed teammate does not roll back the rest:
 * the team keeps an open seat the captain can fill later from the team page.
 */
export async function submitTeamRegistrationCore(
  userId: string,
  input: { shortId: string; teamName: string; memberIds: string[] },
  ctx: { ip: string | null },
): Promise<TeamRegistrationResult> {
  const shortId = String(input.shortId ?? '').trim();
  const teamName = String(input.teamName ?? '').trim();
  const memberIds = Array.isArray(input.memberIds) ? input.memberIds.map((id) => String(id)) : [];

  if (!SHORT_ID_PATTERN.test(shortId)) {
    return { ok: false, error: 'game_not_found' };
  }
  if (teamName.length < TEAM_NAME_MIN || teamName.length > TEAM_NAME_MAX) {
    return { ok: false, error: 'team_name_invalid' };
  }

  const profile = await readProfileGate(userId, 'submitTeamRegistration');
  if (profile !== 'ok') return { ok: false, error: profile };

  const game = await getGameByShortId(shortId);
  if (!game) {
    return { ok: false, error: 'game_not_found' };
  }
  // #2445: a draft answers like a game that does not exist.
  if (game.status === 'draft') {
    return { ok: false, error: 'game_not_found' };
  }
  if (game.registration_type !== 'team' && game.registration_type !== 'both') {
    return { ok: false, error: 'wrong_type' };
  }
  if (game.registration_mode === 'invite_only') {
    return { ok: false, error: 'wrong_mode' };
  }
  if (game.status !== 'scheduled') {
    return { ok: false, error: 'game_locked' };
  }
  // #543: closed signups, as in the solo flow.
  if (game.signups_closed_at != null) {
    return { ok: false, error: 'signup_closed' };
  }
  if (!gameModeSupportsTeams(game.game_mode)) {
    return { ok: false, error: 'mode_does_not_support_teams' };
  }

  const teamSize = resolveTeamSize(game.mode_config);
  if (teamSize === null) {
    return { ok: false, error: 'mode_does_not_support_teams' };
  }

  // The captain is one of the N players, so the members are N−1.
  if (memberIds.length !== teamSize - 1) {
    return { ok: false, error: 'slots_count_wrong' };
  }
  if (memberIds.includes(userId)) {
    return { ok: false, error: 'self_in_slots' };
  }
  if (new Set(memberIds).size !== memberIds.length) {
    return { ok: false, error: 'duplicate_members' };
  }

  // #2840: before any write, the rate-limit bucket included.
  const friendCheck = await checkTeammatesAreFriends(userId, memberIds, 'submitTeamRegistration');
  if (friendCheck !== 'ok') {
    return { ok: false, error: friendCheck };
  }

  // One team submit counts as one registration: a captain filling three seats
  // is not punished for it. The per-game bucket is the natural limit.
  const rateLimit = await consumeRegistrationRateLimit({
    userId,
    ip: ctx.ip ?? 'unknown',
    gameId: game.id,
  });
  if (!rateLimit.ok) {
    return { ok: false, error: 'rate_limited' };
  }

  const admin = getAdminClient();
  const captainStatus = game.registration_mode === 'open' ? 'approved' : 'pending';

  // Captain row. UNIQUE (game_id, user_id) catches a double submit.
  const { data: captainRow, error: captainError } = await admin
    .from('game_registration_requests')
    .insert({
      game_id: game.id,
      user_id: userId,
      status: captainStatus,
      team_name: teamName,
      is_team_captain: true,
      team_request_id: null,
      decided_at: captainStatus === 'approved' ? new Date().toISOString() : null,
      decided_by_user_id: captainStatus === 'approved' ? userId : null,
    })
    .select('id')
    .single<{ id: string }>();

  if (captainError) {
    if (isDuplicateError(captainError)) {
      return { ok: false, error: 'already_registered' };
    }
    console.error('[submitTeamRegistration] captain insert failed', captainError);
    return { ok: false, error: 'db_error' };
  }
  const captainRequestId = captainRow.id;

  const captainName = await getCaptainDisplayName(userId);

  // Open mode: the captain takes a seat now. Manual approval waits for the
  // organiser's approveRequest; the cap applies to open self-registration only
  // (#2011, owner's choice A).
  //
  // #2060/#2062: claim_open_registration_seat (0177) decides the cap, picks the
  // team number and writes the captain's row in one call that locks the game,
  // so two captains arriving together can no longer take the same number.
  // Seats, not rows: a team holds its full size from the moment it exists. The
  // number is the lowest in 1..maxTeamsForSize(teamSize) no active row has.
  let assignedTeamNumber: number | null = null;
  if (captainStatus === 'approved') {
    const cap = teamModePlayerCap(game.game_mode, teamSize);
    // #2209: the captain's tee category from the profile, clamped to the tee.
    const captainTee = (await joinTeeGenders(game.id, [userId]))[userId];
    const { data: claim, error: claimError } = await admin.rpc('claim_open_registration_seat', {
      p_game_id: game.id,
      p_user_id: userId,
      p_seat_team_size: teamSize,
      p_max_teams: maxTeamsForSize(teamSize),
      // #463: the captain signs up themself, so confirmed at once.
      p_accepted_at: acceptedAtForActor(userId, userId)!,
      p_new_team_size: teamSize,
      ...(cap !== null ? { p_cap: cap } : {}),
      p_tee_gender: captainTee,
    });
    if (claimError) {
      console.error('[submitTeamRegistration] captain seat claim failed', claimError);
    }
    const { outcome, team_number: claimedTeam } = (claimError ? {} : (claim ?? {})) as {
      outcome?: string;
      team_number?: number | null;
    };
    if (outcome === 'ok') {
      assignedTeamNumber = claimedTeam ?? null;
    } else {
      // The claim refused or failed. It runs after the captain row exists, so
      // roll that row back either way: no team without players (AGENTS.md trap
      // 5), and a retry must start clean — a request row left behind would
      // answer the retry with already_registered (#667).
      //
      // already_on_roster (#2072): the captain already has a game_players row
      // (added by the organiser without a team), so the new team would get no
      // number. The captain is already registered, so that is the answer.
      let rejection: TeamRegistrationError = 'db_error';
      if (!claimError && outcome === 'already_on_roster') {
        rejection = 'already_registered';
      } else if (
        !claimError &&
        (outcome === 'game_full' ||
          outcome === 'game_locked' ||
          outcome === 'signup_closed' ||
          outcome === 'game_not_found')
      ) {
        rejection = outcome;
      }
      if (rejection === 'db_error' && !claimError) {
        console.error('[submitTeamRegistration] unexpected seat claim outcome', claim);
      }
      // 0 rows = failure, not success (trap 2 / I3).
      try {
        expectAffected(
          await admin
            .from('game_registration_requests')
            .delete()
            .eq('id', captainRequestId)
            .select('id'),
          'submitTeamRegistration',
        );
      } catch (rollbackErr) {
        // The compensation failed and the request row stays behind. Log it,
        // but answer the captain instead of throwing a 500.
        console.error('[submitTeamRegistration] captain rollback failed', rollbackErr);
      }
      return { ok: false, error: rejection };
    }
  }

  const slotResults: TeamSlotResult[] = [];
  for (const memberId of memberIds) {
    try {
      slotResults.push(
        await addTeammateRow({
          game,
          captainId: userId,
          captainName,
          captainRequestId,
          captainStatus,
          teamName,
          memberId,
          teamNumber: assignedTeamNumber,
          flightNumber: assignedTeamNumber,
          context: 'submitTeamRegistration',
        }),
      );
    } catch (err) {
      console.error('[submitTeamRegistration] slot threw', err);
      slotResults.push({ ok: false, userId: memberId, reason: 'unexpected' });
    }
  }

  // Manual approval: tell the organiser a request is waiting. Open mode needs
  // no action from them, and signups can come in a flock.
  if (game.created_by && captainStatus === 'pending') {
    await notify({
      userId: game.created_by,
      kind: 'registration_request',
      payload: {
        game_id: game.id,
        game_name: game.name,
        // Structured fields; «(kaptein for …)» is composed at render time (#583).
        requester_name: captainName,
        team_name: teamName,
        request_id: captainRequestId,
      },
    }).catch((err) => console.error('[submitTeamRegistration] admin notify failed', err));
  }

  expireGameCache(game.id);

  return { ok: true, captainRequestId, slotResults };
}

/**
 * One known teammate on a captain's team: the child request with the captain's
 * status, the roster row in open mode when the captain has a team number, and
 * the `team_invite`. Shared by the team submit and the team page's «add a
 * friend» (`addTeamMemberCore`), so the two can never write a teammate apart.
 *
 * #2223: when the roster row cannot be written, the child request is rolled
 * back so a retry starts clean, and the invite is not sent.
 */
export async function addTeammateRow(opts: {
  game: { id: string; short_id: string; name: string };
  captainId: string;
  captainName: string | null;
  captainRequestId: string;
  captainStatus: 'pending' | 'approved';
  teamName: string | null;
  memberId: string;
  teamNumber: number | null;
  flightNumber: number | null;
  context: string;
}): Promise<TeamSlotResult> {
  const { game, captainId, captainRequestId, captainStatus, memberId, context } = opts;
  const admin = getAdminClient();

  const { error: childError } = await admin.from('game_registration_requests').insert({
    game_id: game.id,
    user_id: memberId,
    status: captainStatus,
    team_name: opts.teamName,
    is_team_captain: false,
    team_request_id: captainRequestId,
    decided_at: captainStatus === 'approved' ? new Date().toISOString() : null,
    decided_by_user_id: captainStatus === 'approved' ? captainId : null,
  });
  if (childError) {
    if (isDuplicateError(childError)) {
      return { ok: false, userId: memberId, reason: 'alreadyRegistered' };
    }
    console.error(`[${context}] child insert failed`, childError);
    return { ok: false, userId: memberId, reason: 'dbError' };
  }

  if (captainStatus === 'approved' && opts.teamNumber !== null) {
    // #2209: the teammate's own tee category, not the column default.
    const teeGenders = await joinTeeGenders(game.id, [memberId]);
    const { error: playerError } = await admin.from('game_players').upsert(
      {
        game_id: game.id,
        user_id: memberId,
        team_number: opts.teamNumber,
        flight_number: opts.flightNumber,
        course_handicap: null,
        // #463: the captain adds a teammate, so not confirmed yet.
        accepted_at: acceptedAtForActor(captainId, memberId),
        tee_gender: teeGenders[memberId],
      },
      { onConflict: 'game_id,user_id', ignoreDuplicates: true },
    );
    if (playerError) {
      console.error(`[${context}] player upsert failed`, {
        gameId: game.id,
        userId: memberId,
        error: playerError,
      });
      try {
        expectAffected(
          await admin
            .from('game_registration_requests')
            .delete()
            .eq('team_request_id', captainRequestId)
            .eq('user_id', memberId)
            .select('id'),
          context,
        );
      } catch (rollbackErr) {
        console.error(`[${context}] child rollback failed`, rollbackErr);
      }
      return { ok: false, userId: memberId, reason: 'dbError' };
    }
  }

  // Best effort. #463: the team_invite nudges the teammate; no player_added on
  // top. Push from notify() reaches players who are away from the app.
  await notifyInvitedToTeam({
    recipientUserId: memberId,
    gameId: game.id,
    gameShortId: game.short_id,
    gameName: game.name,
    teamRequestId: captainRequestId,
    teamName: opts.teamName,
    invitedByName: opts.captainName,
  });

  return { ok: true, outcome: 'known_added', userId: memberId };
}

type OwnRequestRow = {
  id: string;
  game_id: string;
  user_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  team_request_id: string | null;
  team_name: string | null;
  is_team_captain: boolean;
};

/**
 * A teammate says yes. Their request becomes approved (or stays approved from
 * open mode), and they go on the captain's team in `game_players` — only when
 * the captain already has a team number. Otherwise the row waits for the
 * organiser's approval with the rest of the team (#2061).
 */
export async function acceptTeamInviteCore(
  userId: string,
  input: { shortId: string; requestId: string },
): Promise<AcceptDeclineResult> {
  const { shortId, requestId } = input;
  if (!SHORT_ID_PATTERN.test(shortId)) {
    return { ok: false, error: 'not_found' };
  }
  const profile = await readProfileGate(userId, 'acceptTeamInvite');
  if (profile !== 'ok') return { ok: false, error: profile };
  const admin = getAdminClient();

  const { data: req, error: reqError } = await admin
    .from('game_registration_requests')
    .select('id, game_id, user_id, status, team_request_id, team_name, is_team_captain')
    .eq('id', requestId)
    .maybeSingle<OwnRequestRow>();

  // Error ≠ absence (#1445): a transient failure must not read as «this
  // invitation does not exist».
  if (reqError) {
    console.error('[acceptTeamInvite] request lookup failed', { requestId, error: reqError });
    return { ok: false, error: 'db_error' };
  }
  if (!req || req.user_id !== userId) {
    return { ok: false, error: 'not_found' };
  }
  // #2440: only a team member's own row, one with a captain. A solo request or
  // the captain's own request waits for the organiser.
  const captainRequestId = req.team_request_id;
  if (!captainRequestId || req.is_team_captain) {
    return { ok: false, error: 'not_found' };
  }
  if (req.status === 'rejected' || req.status === 'withdrawn') {
    return { ok: false, error: 'not_found' };
  }

  const game = await getGameByShortId(shortId);
  if (!game || game.id !== req.game_id) {
    return { ok: false, error: 'not_found' };
  }
  // #2445: a draft answers like a game that does not exist.
  if (game.status === 'draft') {
    return { ok: false, error: 'not_found' };
  }
  if (game.status !== 'scheduled') {
    return { ok: false, error: 'game_locked' };
  }
  // #543: closed signups freeze a teammate's yes too.
  if (game.signups_closed_at != null) {
    return { ok: false, error: 'signup_closed' };
  }

  // The captain's team number. No row or no number (manual approval, the
  // captain waits for the organiser) → the teammate waits too: approveRequest
  // puts the whole team on one team (#2061).
  // #2440: the captain's row must be in this game — `team_request_id` is not
  // bound to the same game in the database.
  const { data: captainReqRow, error: captainReqError } = await admin
    .from('game_registration_requests')
    .select('user_id')
    .eq('id', captainRequestId)
    .eq('game_id', game.id)
    .maybeSingle<{ user_id: string }>();
  if (captainReqError) {
    console.error('[acceptTeamInvite] captain request lookup failed', {
      requestId,
      error: captainReqError,
    });
    return { ok: false, error: 'db_error' };
  }
  if (!captainReqRow) {
    return { ok: false, error: 'not_found' };
  }
  const { data: captainPlayer, error: captainPlayerError } = await admin
    .from('game_players')
    .select('team_number, flight_number, withdrawn_at')
    .eq('game_id', game.id)
    .eq('user_id', captainReqRow.user_id)
    .maybeSingle<Omit<TeamPlayer, 'user_id'>>();
  if (captainPlayerError) {
    console.error('[acceptTeamInvite] captain player lookup failed', {
      requestId,
      error: captainPlayerError,
    });
    return { ok: false, error: 'db_error' };
  }
  const teamNumber: number | null = captainPlayer?.team_number ?? null;
  const captainRow: TeamPlayer | null = captainPlayer
    ? { ...captainPlayer, user_id: captainReqRow.user_id }
    : null;

  const decidedAt = new Date().toISOString();
  if (req.status === 'pending') {
    // 0 rows = failure (trap 2): when the captain has no team yet this is the
    // only write, so a silent no-op would answer ok for nothing.
    try {
      expectAffected(
        await admin
          .from('game_registration_requests')
          .update({ status: 'approved', decided_at: decidedAt, decided_by_user_id: userId })
          .eq('id', req.id)
          .select('id'),
        'acceptTeamInvite',
      );
    } catch (updateErr) {
      console.error('[acceptTeamInvite] update failed', updateErr);
      return { ok: false, error: 'db_error' };
    }
  }

  if (teamNumber !== null) {
    // #2209: the player's tee category from the profile, clamped to the tee.
    const teeGenders = await joinTeeGenders(game.id, [userId]);
    const { error: playerError } = await admin.from('game_players').upsert(
      {
        game_id: game.id,
        user_id: userId,
        team_number: teamNumber,
        // #2290: the flight follows the team — the captain's flight in best
        // ball, where the organiser may have grouped pairs into flights.
        flight_number: flightForTeam(
          game.game_mode,
          captainRow ? [captainRow] : [],
          userId,
          teamNumber,
        ),
        course_handicap: null,
        // #463: the player accepts themself, so confirmed at once.
        accepted_at: acceptedAtForActor(userId, userId),
        tee_gender: teeGenders[userId],
      },
      { onConflict: 'game_id,user_id', ignoreDuplicates: true },
    );
    if (playerError) {
      console.error('[acceptTeamInvite] player upsert failed', playerError);
      return { ok: false, error: 'db_error' };
    }
  }

  expireGameCache(game.id);
  return { ok: true };
}

/**
 * A teammate says no. Their own row becomes rejected, and the captain gets a
 * `team_member_withdrew`.
 */
export async function declineTeamInviteCore(
  userId: string,
  input: { shortId: string; requestId: string },
): Promise<AcceptDeclineResult> {
  const { shortId, requestId } = input;
  if (!SHORT_ID_PATTERN.test(shortId)) {
    return { ok: false, error: 'not_found' };
  }
  const profile = await readProfileGate(userId, 'declineTeamInvite');
  if (profile !== 'ok') return { ok: false, error: profile };
  const admin = getAdminClient();

  const { data: req, error: reqError } = await admin
    .from('game_registration_requests')
    .select('id, game_id, user_id, status, team_request_id, team_name, is_team_captain')
    .eq('id', requestId)
    .maybeSingle<OwnRequestRow>();
  // #2840: a failed read is not «no such invitation» (I3).
  if (reqError) {
    console.error('[declineTeamInvite] request read failed', { requestId, reqError });
    return { ok: false, error: 'db_error' };
  }

  // #2358: only an invitation can be declined. A rejected captain row would
  // leave the teammates under a rejected captain; the captain withdraws with
  // «Trekk meg», or hands the captaincy on first.
  if (!req || req.user_id !== userId || req.status === 'rejected' || req.is_team_captain) {
    return { ok: false, error: 'not_found' };
  }

  const game = await getGameByShortId(shortId);
  if (!game || game.id !== req.game_id) {
    return { ok: false, error: 'not_found' };
  }
  // #2445: a draft answers like a game that does not exist.
  if (game.status === 'draft') {
    return { ok: false, error: 'not_found' };
  }
  if (game.status !== 'scheduled') {
    return { ok: false, error: 'game_locked' };
  }

  // In open mode the player is already on the roster: remove them. #2223: the
  // roster row goes first, so a failed delete leaves the request untouched and
  // the player can try again. 0 rows is normal in manual approval.
  const { error: playerDeleteError } = await admin
    .from('game_players')
    .delete()
    .eq('game_id', game.id)
    .eq('user_id', userId);
  if (playerDeleteError) {
    console.error('[declineTeamInvite] player delete failed', {
      gameId: game.id,
      userId,
      error: playerDeleteError,
    });
    return { ok: false, error: 'db_error' };
  }

  // #712: 0 rows means the request was already decided (the captain removed
  // the member at the same time) → db_error rather than telling the captain of
  // a withdrawal that was never recorded.
  try {
    expectAffected(
      await admin
        .from('game_registration_requests')
        .update({
          status: 'rejected',
          decided_at: new Date().toISOString(),
          decided_by_user_id: userId,
        })
        .eq('id', req.id)
        .select('id'),
      'declineTeamInvite',
    );
  } catch (updateErr) {
    console.error('[declineTeamInvite] update failed', updateErr);
    return { ok: false, error: 'db_error' };
  }

  // Tell the captain. Best effort.
  if (req.team_request_id) {
    const { data: captainReq } = await admin
      .from('game_registration_requests')
      .select('user_id, team_name')
      .eq('id', req.team_request_id)
      .maybeSingle<{ user_id: string; team_name: string | null }>();
    if (captainReq) {
      const declinerName = await getCaptainDisplayName(userId);
      await notify({
        userId: captainReq.user_id,
        kind: 'team_member_withdrew',
        payload: {
          game_id: game.id,
          game_short_id: game.short_id,
          game_name: game.name,
          withdrawn_player_name: declinerName,
          team_name: captainReq.team_name ?? req.team_name,
        },
      }).catch((err) => console.error('[declineTeamInvite] notify failed', err));
    }
  }

  expireGameCache(game.id);
  return { ok: true };
}
