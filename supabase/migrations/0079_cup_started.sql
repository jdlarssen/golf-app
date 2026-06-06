-- 0079_cup_started.sql
-- Issue #417 — cup-start-varsel via in-app-først-logikk (symmetrisk søster av #377).
--
-- Ny notifications.kind `cup_started`. Fyres til alle cup-deltakere når en
-- cup (tournament av matcher) starter — in-app først, mail kun til off-app
-- (samme prinsipp som cup_finished/game_finished). Samme atomære drop+add-
-- mønster som 0068/0069/0077. Payload-shape ({tournament_id, tournament_name})
-- valideres i TS-laget via Zod (lib/notifications/types.ts) før insert.
--
-- Additivt: hele gjeldende kind-settet (0077) bevares uendret, kun
-- 'cup_started' legges til. Trygt å applye før kode-deploy (jf. 0077-headeren).

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
    'club_join_request',
    'club_role_changed',
    'friend_request',
    'friend_accepted',
    -- Ny for #417:
    'cup_started'               -- «cupen har startet»-varsel til alle deltakere
  ));
