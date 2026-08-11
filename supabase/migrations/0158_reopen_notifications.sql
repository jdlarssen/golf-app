-- 0158_reopen_notifications.sql
-- #1363: to nye notification-kinds `scorecard_reopened` og `game_reopened`.
--
-- `reopenScorecard` nullstiller submitted_at/approved_at og `reopenGame`
-- flipper et ferdig spill tilbake til aktivt — begge uten et pip til de
-- berørte. Spilleren tror fortsatt hen er ferdig (siste status var «levert og
-- godkjent») og avslutningen blokkerer siden på `not_all_submitted`; ved
-- gjenåpnet spill ser deltakerne resultatlista forsvinne uten forklaring.
-- Varslene lukker begge gapene.
--
-- Den polymorfe `notifications`-tabellen (0032) gater `kind` med en
-- CHECK-discriminator som må utvides med de nye verdiene — samme
-- drop+recreate-mønster som 0035/0044/0094/0134/0135/0149.
--
-- DEPLOY-REKKEFØLGE: denne migrasjonen MÅ ligge i basen før koden som fyrer
-- kindene deployes. Uten den avviser CHECK-en inserten, notify() svelger feilen
-- («[notifications] insert failed» i runtime-loggen) og returnerer stille —
-- bruker-symptomet blir identisk med bugen vi fikser. Migrasjonen er rent
-- additiv og bakoverkompatibel, så den kan trygt påføres før deploy.
--
-- Payload-shape (game_id, game_name, actor_name) valideres i TS-laget
-- (lib/notifications/types.ts, scorecardReopenedSchema/gameReopenedSchema) —
-- CHECK-en gater kun kind-strengen, ikke payloadens struktur.

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
    'payment_reminder'
  ));
