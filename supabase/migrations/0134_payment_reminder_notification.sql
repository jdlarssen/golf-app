-- 0134_payment_reminder_notification.sql
-- #1049 (Penger i potten, del 1): ny notification-kind `payment_reminder`.
--
-- Arrangøren purrer spillere som mangler å betale startkontingenten via
-- innboksen (remindUnpaidPlayers). Den polymorfe `notifications`-tabellen
-- (0032) gater `kind` med en CHECK-discriminator som må utvides med den nye
-- verdien — samme drop+recreate-mønster som 0035/0044/0094.
--
-- Payload-shape (game_id, game_name, entry_fee_kr, payment_link) valideres i
-- TS-laget (lib/notifications/types.ts, paymentReminderSchema) — CHECK-en gater
-- kun kind-strengen, ikke payloadens struktur.

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in (
    'invite',
    'peer_approval_request',
    'scorecard_submitted',
    'scorecard_approved',
    'game_finished',
    'product_update',
    'team_invite',
    'registration_request',
    'registration_approved',
    'registration_rejected',
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
    'payment_reminder'
  ));
