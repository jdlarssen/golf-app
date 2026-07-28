-- 0149_scorecard_rejected_notification.sql
-- #1358: ny notification-kind `scorecard_rejected`.
--
-- rejectScorecard nullstiller submitted_at, men sendte ingen beskjed — spilleren
-- fikk vite det først neste gang hen åpnet spill-hjem, mens /approve-banneret
-- lovte «Spilleren blir varslet». Varselet lukker det gapet.
--
-- Den polymorfe `notifications`-tabellen (0032) gater `kind` med en
-- CHECK-discriminator som må utvides med den nye verdien — samme
-- drop+recreate-mønster som 0035/0044/0094/0134/0135.
--
-- DEPLOY-REKKEFØLGE: denne migrasjonen MÅ ligge i basen før koden som fyrer
-- kind-en deployes. Uten den avviser CHECK-en inserten, notify() svelger feilen
-- («[notifications] insert failed» i runtime-loggen) og returnerer stille —
-- bruker-symptomet blir identisk med bugen vi fikser. Migrasjonen er rent
-- additiv og bakoverkompatibel, så den kan trygt påføres før deploy.
--
-- Payload-shape (game_id, game_name, rejecter_name, reason) valideres i TS-laget
-- (lib/notifications/types.ts, scorecardRejectedSchema) — CHECK-en gater kun
-- kind-strengen, ikke payloadens struktur.

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in (
    'invite',
    'peer_approval_request',
    'scorecard_submitted',
    'scorecard_approved',
    'scorecard_rejected',
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
