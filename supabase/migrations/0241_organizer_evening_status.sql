-- 0241_organizer_evening_status.sql
-- =============================================================================
-- #2483 - the evening before a scheduled round the organiser hears where it
-- stands: «I morgen: Lørdagsrunden. 7 av 8 har bekreftet. Kari har ikke
-- svart.» The varsel opens «Klar for i morgen?» (/admin/games/[id]/i-morgen),
-- where the organiser can nudge the one who has not answered.
--
-- One new kind in the kind CHECK, same drop and re-add as 0226, 0227 and 0234
-- (whose list, with 'friend_achievement', this one keeps):
--   'organizer_evening_status'   to games.created_by, once per round, from
--                                 the evening sweep (0242)
-- The payload (game_id, game_name, tee_off_at, confirmed, total,
-- unanswered_names, unanswered_more) is validated in
-- lib/notifications/types.ts. lib/notifications/kindCheckParity.test.ts holds
-- the list equal to the TypeScript union.
--
-- One claim stamp on games, the same pattern as
-- games.organizer_stale_reminder_sent_at (0204): the sweep sets it with
-- `... where organizer_evening_notice_sent_at is null and status =
-- 'scheduled'` and only sends when that update won the row, so the
-- organiser hears it once per round, also when two sweeps meet. Moving the
-- tee-off («Flytt runden» or «Rediger») clears it in the same write, so the
-- varsel comes again the evening before the new day. Nullable, no default:
-- every existing game starts unclaimed.
--
-- Additive: the old code never writes the new kind or reads the new column,
-- so this migration goes on BEFORE the code deploys. Without it the claim
-- update fails on the unknown column and the move writes are refused, so it
-- must be on first. The cron job that calls the sweep is 0242, which goes on
-- AFTER the deploy.
-- =============================================================================

alter table public.games
  add column organizer_evening_notice_sent_at timestamptz;

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
    'friend_achievement',
    'organizer_evening_status'
  ));
