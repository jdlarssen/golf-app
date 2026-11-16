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
 * The group of every notification kind. A `Record` over the whole union, like
 * `NOTIFICATION_ICON`: a new kind does not compile until it has a group.
 *
 * `idea_built` sits under «Rundene dine» (the owner, 14.11: no switch of its
 * own; it goes only to the player who sent the idea, and rarely). It therefore
 * also pushes at night, like the rest of the group. `product_update` needs a
 * group for the map to be complete, but `QUIET_KINDS` stops it before the
 * filter: it never pushes.
 */
const PUSH_GROUP_OF_KIND: Record<NotificationKind, PushGroupId> = {
  idea_built: 'rounds',
  product_update: 'rounds',
  invite: 'rounds',
  team_invite: 'rounds',
  player_added: 'rounds',
  registration_approved: 'rounds',
  registration_rejected: 'rounds',
  registration_expired: 'rounds',
  game_started: 'rounds',
  game_moved: 'rounds',
  game_cancelled: 'rounds',
  // #2483: the organiser's own round, the evening before it.
  organizer_evening_status: 'rounds',
  auto_start_blocked: 'rounds',
  game_finished: 'rounds',
  game_reopened: 'rounds',
  achievement_unlocked: 'rounds',
  payment_reminder: 'rounds',
  cup_started: 'rounds',
  cup_finished: 'rounds',
  cup_lineup_revealed: 'rounds',
  league_round_open: 'rounds',
  league_round_closing: 'rounds',
  peer_approval_request: 'scorecards',
  scorecard_submitted: 'scorecards',
  scorecard_approved: 'scorecards',
  scorecard_rejected: 'scorecards',
  scorecard_reopened: 'scorecards',
  deliver_reminder: 'scorecards',
  missing_score_reminder: 'scorecards',
  all_scorecards_delivered: 'scorecards',
  // The organizer hears that the round has stood still for a day: with the
  // other delivery reminders.
  game_stale_reminder: 'scorecards',
  league_marker_request: 'scorecards',
  friend_request: 'friends',
  friend_accepted: 'friends',
  friend_achievement: 'friends',
  // The nearest group; the alternative was to lock it under «Rundene dine».
  club_role_changed: 'friends',
  registration_request: 'signups',
  team_member_withdrew: 'signups',
  cup_signup: 'signups',
  club_join_request: 'signups',
};

/** The group a notification kind belongs to. */
export function pushGroupForKind(kind: NotificationKind): PushGroupId {
  return PUSH_GROUP_OF_KIND[kind];
}
