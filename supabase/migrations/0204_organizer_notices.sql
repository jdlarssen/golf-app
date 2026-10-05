-- 0204_organizer_notices.sql
-- The organiser hears when the round can be finished, and when it has stood
-- still for a day (#2203, the owner's choice 2026-09-25). The game never
-- finishes itself.
--
-- Two new kinds in the kind CHECK:
--   'all_scorecards_delivered'  every active card is in (and approved, with
--                               peer approval): «Alle har levert. Avslutt
--                               spillet.»
--   'game_stale_reminder'       an active round with no new score, delivery,
--                               approval or withdrawal for 24 hours
-- Same drop/re-add pattern as 0203. Payload shape (game_id, game_name) is
-- validated in the TS layer (lib/notifications/types.ts). The CHECK gates the
-- kind string only, and lib/notifications/kindCheckParity.test.ts holds the
-- list equal to the TS union.
--
-- Two claim stamps on games, one per message, the same pattern as
-- games.auto_start_blocked_notified_at: the sender sets the stamp with
-- `... where <stamp> is null and status = 'active'` and only sends when that
-- update won a row, so each message goes once per game, never twice (the
-- owner's answer 2026-10-05: «Én per spill»). Nullable, no default: every
-- existing game starts unclaimed.
--   organizer_all_delivered_notified_at  lib/notifications/organizerNotices.ts
--   organizer_stale_reminder_sent_at     same file, and the cron gate in 0205
--
-- Additive: the old code never writes the new kinds or reads the new
-- columns, so this migration goes on BEFORE the code deploys. Without it the
-- CHECK refuses the inserts (notify only logs it), and the claim update fails
-- on the unknown column, so no organiser hears anything.

alter table public.games
  add column organizer_all_delivered_notified_at timestamptz,
  add column organizer_stale_reminder_sent_at timestamptz;

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
    'game_stale_reminder'
  ));
