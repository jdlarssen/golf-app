import type { NotificationKind } from './types';

/**
 * The drawn icons an inbox row can wear (the Tørny line-icon set,
 * `components/icons/Icons.tsx`). Names only, so this file stays pure data; the
 * component that draws them is `components/notifications/NotificationIcon.tsx`.
 */
export type NotificationIconName =
  | 'konvolutt'
  | 'scorekort'
  | 'pokal'
  | 'flagg'
  | 'kalender'
  | 'profil'
  | 'klubbhus'
  | 'replay';

/**
 * One icon per notification kind — the disc on an inbox row without a person
 * (#2263; before that an emoji, replaced by drawn icons). One home, so a new
 * kind is a compile error here until it has one. Grouped by what the row is
 * about, not one icon per kind, so the inbox reads as a handful of families:
 *
 *  - konvolutt: an invitation, request, registration, payment reminder or news
 *    from Tørny — mail to you;
 *  - scorekort: a scorecard, or a reminder about one;
 *  - pokal: a result, a finished cup, an achievement;
 *  - flagg: a round starting, moving, cancelled or standing still;
 *  - kalender: a league round's window;
 *  - profil: a person (friend, new player, a member who left);
 *  - klubbhus: the club;
 *  - replay: something reopened.
 */
export const NOTIFICATION_ICON: Record<NotificationKind, NotificationIconName> = {
  invite: 'konvolutt',
  peer_approval_request: 'scorekort',
  scorecard_submitted: 'scorekort',
  scorecard_approved: 'scorekort',
  scorecard_rejected: 'scorekort',
  // #1363: the card, or the whole round, is open again.
  scorecard_reopened: 'replay',
  game_finished: 'pokal',
  game_reopened: 'replay',
  product_update: 'konvolutt',
  team_invite: 'konvolutt',
  registration_request: 'konvolutt',
  registration_approved: 'konvolutt',
  registration_rejected: 'konvolutt',
  registration_expired: 'konvolutt',
  team_member_withdrew: 'profil',
  deliver_reminder: 'scorekort',
  // #2268: a hole without a score.
  missing_score_reminder: 'scorekort',
  // #2203: every card is in.
  all_scorecards_delivered: 'scorekort',
  // #2203: the round has stood still for a day.
  game_stale_reminder: 'flagg',
  // #2638: a league round opens, and closes in under two days.
  league_round_open: 'kalender',
  league_round_closing: 'kalender',
  // #2661: a card waits for you as its marker, like peer_approval_request.
  league_marker_request: 'scorekort',
  cup_finished: 'pokal',
  cup_started: 'flagg',
  cup_signup: 'konvolutt',
  // #1884: the matches have just been revealed.
  cup_lineup_revealed: 'pokal',
  club_join_request: 'klubbhus',
  club_role_changed: 'klubbhus',
  friend_request: 'profil',
  friend_accepted: 'profil',
  player_added: 'profil',
  game_started: 'flagg',
  // #2480: the round has a new day or time.
  game_moved: 'flagg',
  auto_start_blocked: 'flagg',
  achievement_unlocked: 'pokal',
  idea_built: 'konvolutt',
  // A reminder letter about money; nothing in the set draws coins, and a new
  // icon for one kind is not worth it.
  payment_reminder: 'konvolutt',
  // #2481: the round is off.
  game_cancelled: 'flagg',
};
