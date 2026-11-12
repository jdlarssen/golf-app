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
import { getRegistrationSeats } from './getRegistrationSeats';
import { isMatchplayMode } from './matchplaySides';
import { capacityState, type GameSeats } from './terminliste';

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
  /**
   * #2837: the player's own solo request waits, so «Trekk forespørselen» can go
   * through. Not a captain's team, a teammate's row or a guest someone brought:
   * those belong to someone else's signup.
   */
  ownRequestCancellable: boolean;
  /** #2837: every seat is taken. False without a cap or when the count failed. */
  isFull: boolean;
  /** The count behind `isFull`, for «12 av 12 plasser». Numbers, never names. */
  seats: GameSeats | null;
};

export type SignupFactsGame = Pick<
  ShortIdGame,
  'id' | 'group_id' | 'registration_mode' | 'let_friends_skip_gate' | 'created_by' | 'game_mode' | 'mode_config'
>;

type RequestRow = PendingRequestRow & {
  is_team_captain: boolean;
  brought_by_user_id: string | null;
};

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
    .select('status, team_request_id, is_team_captain, brought_by_user_id')
    .eq('game_id', game.id)
    .eq('user_id', userId)
    .maybeSingle<RequestRow>();
  if (requestError) throw requestError;

  if (player == null && request) {
    request.captain_status = await readCaptainStatus(request);
  }

  const { isFull, seats } = await readSeatFacts(game);
  return {
    profileCompleted: profile?.profile_completed_at != null,
    isAlreadyRegistered: player != null,
    requestView: pendingRequestView(request),
    hasPendingInvitation: profile ? await readHasPendingInvitation(game.id, profile.email) : false,
    isClubMember: await readIsClubMember(game, userId),
    viewerIsFriend: await readViewerIsFriend(game, userId),
    ownRequestCancellable: isOwnPendingRequest(request),
    isFull,
    seats,
  };
}

/** The filter `withdrawRequestCore` writes with, as a fact about the row. */
function isOwnPendingRequest(row: RequestRow | null): boolean {
  return (
    row?.status === 'pending' &&
    row.team_request_id == null &&
    !row.is_team_captain &&
    row.brought_by_user_id == null
  );
}

/**
 * #2837: the terminliste's count (`getRegistrationSeats`, #2258), on the SQL
 * function the seat claim counts with, so «full» here is full there. Matchplay
 * is skipped: its side picker on the website says which side has room. A failed
 * count is no count: the form shows and the claim decides, as before. Shared
 * with `/signup/[shortId]`, which reads its own facts.
 */
export async function readSeatFacts(
  game: Pick<SignupFactsGame, 'id' | 'game_mode' | 'mode_config'>,
): Promise<{ isFull: boolean; seats: GameSeats | null }> {
  if (isMatchplayMode(game.game_mode)) return { isFull: false, seats: null };
  let seats: GameSeats | null = null;
  try {
    const all = await getRegistrationSeats([
      { id: game.id, game_mode: game.game_mode, mode_config: game.mode_config },
    ]);
    seats = all.get(game.id) ?? null;
  } catch (err) {
    console.error('[loadSignupFacts] seat count failed', { gameId: game.id, err });
  }
  return {
    isFull: seats?.kind === 'capped' && capacityState(seats).free === 0,
    seats,
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
