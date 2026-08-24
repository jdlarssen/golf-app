-- 0163_cup_signup_notification_kind.sql
-- Utvid notifications_kind_check med 'cup_signup' (issue #1490): varsel til
-- cupens skaper når en spiller melder seg på eller av via delbar lenke.
--
-- Samme drop/re-add-mønster som 0158. Payload-shape (tournament_id,
-- tournament_name, group_id, participant_name, action) valideres i TS-laget
-- (lib/notifications/types.ts, cupSignupSchema) — CHECK-en gater kun
-- kind-strengen.

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
    'cup_signup'
  ));
