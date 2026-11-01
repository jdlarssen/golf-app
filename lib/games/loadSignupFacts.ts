import 'server-only';
import {
  pendingRequestView,
  type PendingRequestRow,
  type PendingRequestView,
} from '@/app/[locale]/signup/[shortId]/pendingRequestView';
import { readFriendIds } from '@/lib/friends/getFriendIds';
import { getAdminClient } from '@/lib/supabase/admin';
import { emailMatchPattern } from '@/lib/supabase/emailMatch';
import type { ShortIdGame } from './getGameByShortId';

/**
 * What the signup rule (`signupOffer.ts`) needs to know about one player in one
 * round (#2748), read through the service role because the player is not
 * necessarily on the roster yet: the same reads as `/signup/[shortId]`.
 *
 * Throws when a read fails. The callers gate a write or answer the app, and
 * «we don't know» must never read as «not a member» (#1863). `userId` comes from
 * the caller's verified session or token, never from a form or a body.
 */

export type SignupViewerFacts = {
  /** `users.profile_completed_at` is set; a missing row counts as not. */
  profileCompleted: boolean;
  isAlreadyRegistered: boolean;
  requestView: PendingRequestView;
  hasPendingInvitation: boolean;
  isClubMember: boolean;
  viewerIsFriend: boolean;
};

export type SignupFactsGame = Pick<
  ShortIdGame,
  'id' | 'group_id' | 'registration_mode' | 'let_friends_skip_gate' | 'created_by'
>;

export async function loadSignupFacts(
  game: SignupFactsGame,
  userId: string,
): Promise<SignupViewerFacts> {
  const admin = getAdminClient();

  const { data: profile, error: profileError } = await admin
    .from('users')
    .select('profile_completed_at, email')
    .eq('id', userId)
    .maybeSingle<{ profile_completed_at: string | null; email: string }>();
  if (profileError) throw profileError;

  const { data: player, error: playerError } = await admin
    .from('game_players')
    .select('game_id')
    .eq('game_id', game.id)
    .eq('user_id', userId)
    .maybeSingle<{ game_id: string }>();
  if (playerError) throw playerError;

  const { data: request, error: requestError } = await admin
    .from('game_registration_requests')
    .select('status, team_request_id')
    .eq('game_id', game.id)
    .eq('user_id', userId)
    .maybeSingle<PendingRequestRow>();
  if (requestError) throw requestError;

  if (player == null && request) {
    request.captain_status = await readCaptainStatus(request);
  }

  return {
    profileCompleted: profile?.profile_completed_at != null,
    isAlreadyRegistered: player != null,
    requestView: pendingRequestView(request),
    hasPendingInvitation: profile ? await readHasPendingInvitation(game.id, profile.email) : false,
    isClubMember: await readIsClubMember(game, userId),
    viewerIsFriend: await readViewerIsFriend(game, userId),
  };
}

/**
 * #2061: a teammate who said yes before the organiser approved the captain has
 * an approved row but no game_players row yet. Only the captain's status tells
 * that apart from a player the organiser removed.
 */
async function readCaptainStatus(
  row: PendingRequestRow,
): Promise<PendingRequestRow['status'] | null> {
  if (row.status !== 'approved' || !row.team_request_id) return null;
  const { data, error } = await getAdminClient()
    .from('game_registration_requests')
    .select('status')
    .eq('id', row.team_request_id)
    .maybeSingle<{ status: PendingRequestRow['status'] }>();
  if (error) throw error;
  return data?.status ?? null;
}

/** #1437: an expired invitation is no invitation, as at the login gate (#1348). */
async function readHasPendingInvitation(gameId: string, email: string): Promise<boolean> {
  const { data, error } = await getAdminClient()
    .from('invitations')
    .select('id')
    .filter('email', 'imatch', emailMatchPattern(email))
    .eq('game_id', gameId)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .returns<{ id: string }[]>();
  if (error) throw error;
  return (data ?? []).length > 0;
}

async function readIsClubMember(game: SignupFactsGame, userId: string): Promise<boolean> {
  if (!game.group_id) return false;
  const { data, error } = await getAdminClient()
    .from('group_members')
    .select('user_id')
    .eq('group_id', game.group_id)
    .eq('user_id', userId)
    .maybeSingle<{ user_id: string }>();
  if (error) throw error;
  return data != null;
}

/** Skipped for every game but the one where the answer changes anything (#369). */
async function readViewerIsFriend(game: SignupFactsGame, userId: string): Promise<boolean> {
  if (
    game.registration_mode !== 'manual_approval' ||
    game.let_friends_skip_gate !== true ||
    !game.created_by
  ) {
    return false;
  }
  const friendIds = await readFriendIds(userId);
  return friendIds.includes(game.created_by);
}
