-- 0243_tee_interval_and_tee_time_notice.sql
-- =============================================================================
-- #2451 - a start time per flight. When a round has more than one start
-- group, each group goes out its own number of minutes after the first
-- tee-off: «09:00 Flight 1, 09:10 Flight 2, 09:20 Flight 3». The player sees
-- their own time on the game page, in the invitation and in a new varsel when
-- the time changes.
--
-- ONE COLUMN
--   tee_interval_minutes   The minutes between two start groups: 8, 10 or 12.
--                          NULL means every group goes out at the round's
--                          tee-off, which is how every round worked before.
--                          No default: existing rounds, cup matches, league
--                          rounds and rounds made in the app stay NULL and
--                          look the way they did. The web wizard writes 10 for
--                          a new standalone round that can have more than one
--                          group; the organiser changes it in step 4, in
--                          «Rediger spill» or on the Startlista.
--
-- The time of each group is never stored. It is worked out every time from
-- scheduled_tee_off_at, the player's start group and this interval
-- (lib/games/flightTeeTimes.ts, the rule's one home, which the cup's
-- FLIGHT_TEE_OFF_STAGGER_MINUTES also goes through).
-- games_tee_interval_minutes_choices holds the three choices;
-- lib/games/flightTeeTimes.test.ts checks TEE_INTERVAL_CHOICES agrees with it.
--
-- WHO MAY WRITE IT
-- No new policy. The only UPDATE policies on games are «games creator update»
-- (created_by = auth.uid()) and «games admin update», as for repeat_weekly
-- (0240), so only the organiser and global admins can write it. A PATCH from
-- anyone else matches 0 rows (supabase/tests/games_tee_interval_test.sql).
--
-- ONE NEW KIND in the kind CHECK, same drop and re-add as 0226, 0227, 0234 and
-- 0241 (whose list this one keeps):
--   'tee_time_changed'   to a player in a scheduled round whose own start
--                        time moved because the organiser changed the flights,
--                        the teams or the interval. Written by the server only
--                        (notifications has no insert policy).
-- The payload (game_id, game_name, tee_off_at) is validated in
-- lib/notifications/types.ts. lib/notifications/kindCheckParity.test.ts holds
-- the list equal to the TypeScript union.
--
-- DEPLOY ORDER: additive, and it goes on BEFORE the code is merged. The old
-- code never reads the column or writes the kind. The new code reads the
-- column on the game page and the Startlista, and without it those reads get
-- 42703.
-- =============================================================================

alter table public.games
  add column if not exists tee_interval_minutes smallint;

alter table public.games
  add constraint games_tee_interval_minutes_choices
    check (tee_interval_minutes in (8, 10, 12));

comment on column public.games.tee_interval_minutes is
  '#2451: minutes between two start groups (8, 10 or 12). Start group N goes out at scheduled_tee_off_at + (N - 1) x this interval; the rule lives in lib/games/flightTeeTimes.ts. NULL: every group goes out at scheduled_tee_off_at, as before. Written by the organiser or an admin.';

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
    'organizer_evening_status',
    'tee_time_changed'
  ));
