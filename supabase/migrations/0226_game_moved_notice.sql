-- 0226_game_moved_notice.sql
-- =============================================================================
-- #2480 - «Flytt runden»: when the organiser (or an admin) moves a scheduled
-- round to a new day or time, every player on the roster gets one notice
-- with the new tee-off, in the inbox and as push. The same question comes up
-- when tee-off is changed in «Rediger».
--
-- Additive: the old code never writes the new kind, so this migration goes on
-- BEFORE the code deploys. Without it the CHECK refuses the insert, `notify`
-- only logs the failure, and the round is moved without anyone being told.
--
-- One new kind in the kind CHECK, same drop/re-add as 0217 and 0220. Payload
-- shape (game_id, game_name, tee_off_at, course_changed, moved_by_name) is
-- validated in lib/notifications/types.ts, and
-- lib/notifications/kindCheckParity.test.ts holds the list equal to the TS
-- union.
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
    'game_moved'
  ));
