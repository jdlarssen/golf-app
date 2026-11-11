-- 0234_friend_achievement_notification.sql
-- =============================================================================
-- #2800 - when a round is finished, a player's gross hole-in-one, albatross or
-- eagle is told to the people around them: the other players in the league
-- when the game is a league round, otherwise their accepted friends. Nobody
-- who played the same game is told. The finish pipeline writes one
-- notification of kind 'friend_achievement' per recipient per player
-- (lib/games/notifyFriendsOfAchievements.ts), with the service role.
--
-- Additive: the old code never writes the new kind, so this migration goes
-- on BEFORE the code deploys. Without it the CHECK refuses every insert,
-- `notify` only logs it, and no one hears about the eagle.
--
-- One new kind in the kind CHECK, same drop and re-add as 0226 and 0227
-- (whose list, with 'game_cancelled', this one keeps). The payload
-- (game_id, player_id, player_name, course_name, league_id, moments) is
-- validated in lib/notifications/types.ts. lib/notifications/kindCheckParity.test.ts
-- holds the list equal to the TypeScript union.
-- =============================================================================

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in (
    'invite',
    'peer_approval_request',
    'scorecard_submitted',
    'scorecard_approved',
    'scorecard_rejected',
    'scorecard_reopened',
    'game_finished',
    'game_reopened',
    'product_update',
    'team_invite',
    'registration_request',
    'registration_approved',
    'registration_rejected',
    'registration_expired',
    'team_member_withdrew',
    'deliver_reminder',
    'cup_finished',
    'cup_started',
    'club_join_request',
    'club_role_changed',
    'friend_request',
    'friend_accepted',
    'player_added',
    'game_started',
    'auto_start_blocked',
    'achievement_unlocked',
    'idea_built',
    'payment_reminder',
    'cup_signup',
    'cup_lineup_revealed',
    'missing_score_reminder',
    'all_scorecards_delivered',
    'game_stale_reminder',
    'league_round_open',
    'league_round_closing',
    'league_marker_request',
    'game_moved',
    'game_cancelled',
    'friend_achievement'
  ));
