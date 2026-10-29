-- 0226_game_cancelled_notification.sql
-- =============================================================================
-- #2481 - cancelling a scheduled round tells the players. The organiser's
-- delete page for a scheduled game becomes «Avlys runden?», and «Avlys og si
-- fra» writes one notification of kind 'game_cancelled' to every player on
-- the list (not guests, not the one who cancels) before the redirect.
--
-- Additive: the old code never writes the new kind, so this migration goes
-- on BEFORE the code deploys. Without it the CHECK refuses every insert,
-- `notify` only logs it, and the round is deleted with no one told: the
-- exact thing the page now promises not to do.
--
-- One new kind in the kind CHECK, same drop and re-add as 0203, 0204, 0217
-- and 0220. The payload (game_name, tee_off_at, course_name, organizer_name,
-- message) is validated in lib/notifications/types.ts. It has no game_id: the
-- game is gone when the notice is read. lib/notifications/kindCheckParity.test.ts
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
    'game_cancelled'
  ));
