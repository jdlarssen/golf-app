-- 0069_cup_finished.sql
-- Issue #377 — avslutnings-varsel via samme in-app-først-logikk.
--
-- Ny notifications.kind `cup_finished`. Fyres til alle cup-deltakere når en
-- cup (tournament av matcher) avsluttes — in-app først, mail kun til off-app
-- (samme prinsipp som game_finished). Samme atomære drop+add-mønster som 0068.
-- Payload-shape ({tournament_id, tournament_name}) valideres i TS-laget via
-- Zod (lib/notifications/types.ts) før insert, ingen DB-CHECK på struktur.

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
    -- Ny for #377:
    'cup_finished'              -- «cupen er avgjort»-varsel til alle deltakere
  ));
