import type { NotificationKind } from './types';

/**
 * The pages a notification links to (#2201). Opening one marks the viewer's
 * unread notifications it answers as read: what you have seen is read.
 */
export type VisitSurface =
  | 'gameHome'
  | 'gameApprove'
  | 'gameLeaderboard'
  | 'gameSubmit'
  | 'gameHole'
  | 'gameFinish'
  | 'adminGame'
  | 'adminSignups'
  | 'teamSignup'
  | 'cup'
  | 'cupResults'
  | 'cupParticipants'
  | 'club'
  | 'friends'
  | 'history';

/** The payload field that ties a notification to the page's entity. */
export type VisitKey = 'game_id' | 'tournament_id' | 'group_id';

export type VisitRule = {
  kinds: readonly NotificationKind[];
  /** `null`: the page has no entity, so every unread row of these kinds is read. */
  key: VisitKey | null;
};

/**
 * Which kinds each page clears, and by which payload field. The one home for
 * «what is cleared where» (#2201): every page calls `markReadOnVisit` with its
 * surface, and the app (`native/app`) reads the same map. A kind may sit on
 * more than one surface: an `invite` or `auto_start_blocked` reaches an admin
 * on the Sekretariat as well as on the game page, and since #2203 a
 * `scorecard_submitted` goes to the organiser on the game page (older rows and
 * a non-playing admin end up on the desk).
 *
 * Pure module with type-only imports, so the app can import it without
 * pulling in the zod schemas.
 */
export const READ_ON_VISIT: Record<VisitSurface, VisitRule> = {
  gameHome: {
    kinds: [
      'invite',
      'scorecard_approved',
      'scorecard_rejected',
      'scorecard_reopened',
      'game_reopened',
      'registration_approved',
      'player_added',
      'game_started',
      'payment_reminder',
      'auto_start_blocked',
      'scorecard_submitted',
    ],
    key: 'game_id',
  },
  gameApprove: { kinds: ['peer_approval_request'], key: 'game_id' },
  gameLeaderboard: { kinds: ['game_finished'], key: 'game_id' },
  gameSubmit: { kinds: ['deliver_reminder'], key: 'game_id' },
  gameHole: { kinds: ['missing_score_reminder'], key: 'game_id' },
  // #2203: the organiser's «Avslutt spillet» page.
  gameFinish: { kinds: ['all_scorecards_delivered', 'game_stale_reminder'], key: 'game_id' },
  adminGame: {
    kinds: ['scorecard_submitted', 'invite', 'auto_start_blocked'],
    key: 'game_id',
  },
  adminSignups: { kinds: ['registration_request'], key: 'game_id' },
  teamSignup: { kinds: ['team_invite', 'team_member_withdrew'], key: 'game_id' },
  cup: { kinds: ['cup_started', 'cup_lineup_revealed'], key: 'tournament_id' },
  cupResults: { kinds: ['cup_finished'], key: 'tournament_id' },
  cupParticipants: { kinds: ['cup_signup'], key: 'tournament_id' },
  club: { kinds: ['club_join_request', 'club_role_changed'], key: 'group_id' },
  friends: { kinds: ['friend_request', 'friend_accepted'], key: null },
  history: { kinds: ['achievement_unlocked'], key: null },
};

/**
 * Kinds without a page of their own. They are read when tapped in the inbox,
 * or when their push is tapped (`?varsel=`, `readMarker.ts`).
 */
export const INBOX_ONLY_KINDS: readonly NotificationKind[] = [
  'registration_rejected',
  'registration_expired',
  'idea_built',
  'product_update',
];

/**
 * Kinds that are never pushed and never light the Innboks dot (#2201, the
 * owner's choice): news about Tørny. The row is still stored, so it shows in
 * the inbox and in the banner on Hjem. Read by `notify` and by
 * `useUnreadNotificationsCount`.
 */
export const QUIET_KINDS: readonly NotificationKind[] = ['product_update'];
