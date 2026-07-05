-- 0135_registration_expired_notification.sql
-- #1055: ny notification-kind `registration_expired`.
--
-- Ventende game_registration_requests fryser usynlig når spillet starter
-- før admin rakk å godkjenne/avslå — approve/reject er hard-låst post-start
-- (game_locked-redirect i admin/games/[id]/signups/actions.ts). startScheduledGame
-- flipper nå automatisk alle fortsatt-pending requests for spillet til
-- 'rejected' (gjenbruker eksisterende status — enum-typen har ingen egen
-- "expired"-verdi) og fyrer dette varselet i stedet for registration_rejected,
-- som ellers ville antydet en aktiv admin-avgjørelse.
--
-- Den polymorfe `notifications`-tabellen (0032) gater `kind` med en
-- CHECK-discriminator som må utvides med den nye verdien — samme
-- drop+recreate-mønster som 0035/0044/0094/0134.
--
-- Payload-shape (game_id, game_name) valideres i TS-laget
-- (lib/notifications/types.ts, registrationExpiredSchema) — CHECK-en gater
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
    'payment_reminder'
  ));
