import type { NotificationKind } from './types';

/**
 * The groups on Profil → Varsler og tema (#2315): what a player can choose to
 * hear as a push. One home for the server filter (`shouldPush` in
 * `pushPreferences.ts`) and the app's switches. Pure, with only a type import,
 * so the app can import it like `readMarker.ts`.
 *
 * Only the push is affected. The inbox row and the email are as before.
 */
export type PushGroupId = 'rounds' | 'scorecards' | 'friends' | 'signups';

export type MutablePushGroupId = Exclude<PushGroupId, 'rounds'>;

export type PushGroup = {
  id: PushGroupId;
  /** Always on, no switch. */
  locked: boolean;
};

/**
 * In display order. «Rundene dine» is locked: a player who does not get the
 * invitation, the start, the move, the cancellation and the result falls out
 * of the round.
 */
export const PUSH_GROUPS: readonly PushGroup[] = [
  { id: 'rounds', locked: true },
  { id: 'scorecards', locked: false },
  { id: 'friends', locked: false },
  { id: 'signups', locked: false },
];

/**
 * The groups a player can turn off. The CHECK on
 * `notification_preferences.muted_groups` (0236) allows exactly these;
 * `pushGroups.test.ts` holds the two equal.
 */
export const MUTABLE_PUSH_GROUPS: readonly MutablePushGroupId[] = ['scorecards', 'friends', 'signups'];

export function isLockedPushGroup(group: PushGroupId): boolean {
  return PUSH_GROUPS.some((g) => g.id === group && g.locked);
}

/**
 * The group a notification kind belongs to. Exhaustive: a new kind does not
 * compile until it has a group.
 *
 * `idea_built` sits under «Rundene dine» (the owner, 14.11: no switch of its
 * own; it goes only to the player who sent the idea, and rarely). It therefore
 * also pushes at night, like the rest of the group. `product_update` needs a
 * group for the switch to be exhaustive, but `QUIET_KINDS` stops it before the
 * filter: it never pushes.
 */
export function pushGroupForKind(kind: NotificationKind): PushGroupId {
  switch (kind) {
    case 'idea_built':
    case 'product_update':
    case 'invite':
    case 'team_invite':
    case 'player_added':
    case 'registration_approved':
    case 'registration_rejected':
    case 'registration_expired':
    case 'game_started':
    case 'game_moved':
    case 'game_cancelled':
    case 'auto_start_blocked':
    case 'game_finished':
    case 'game_reopened':
    case 'achievement_unlocked':
    case 'payment_reminder':
    case 'cup_started':
    case 'cup_finished':
    case 'cup_lineup_revealed':
    case 'league_round_open':
    case 'league_round_closing':
      return 'rounds';
    case 'peer_approval_request':
    case 'scorecard_submitted':
    case 'scorecard_approved':
    case 'scorecard_rejected':
    case 'scorecard_reopened':
    case 'deliver_reminder':
    case 'missing_score_reminder':
    case 'all_scorecards_delivered':
    // The organizer hears that the round has stood still for a day: with the
    // other delivery reminders.
    case 'game_stale_reminder':
    case 'league_marker_request':
      return 'scorecards';
    case 'friend_request':
    case 'friend_accepted':
    case 'friend_achievement':
    // The nearest group; the alternative was to lock it under «Rundene dine».
    case 'club_role_changed':
      return 'friends';
    case 'registration_request':
    case 'team_member_withdrew':
    case 'cup_signup':
    case 'club_join_request':
      return 'signups';
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}
