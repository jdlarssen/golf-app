-- 0068_deliver_reminder.sql
-- Issue #376 — leverings-påminnelse (auto-nudge når spilleren er ferdig + admin-purring).
--
-- (1) Ny notifications.kind `deliver_reminder`. Samme atomære drop+add-mønster
--     som 0044 — payload-shape ({game_id, game_name}) valideres i TS-laget via
--     Zod (lib/notifications/types.ts) før insert, ingen DB-CHECK på struktur.
-- (2) Idempotens-kolonne på game_players. Settes når en leverings-påminnelse
--     er sendt (auto eller manuell) slik at auto-nudgen fyrer kun én gang per
--     spiller. Atomisk betinget update (... where deliver_reminder_sent_at is
--     null ...) er gaten — samme airtight-mønster som submitted_at-guarden i
--     submitScorecard.

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
    -- Ny for #376:
    'deliver_reminder'          -- «husk å levere scorekortet»-varsel
  ));

alter table public.game_players
  add column if not exists deliver_reminder_sent_at timestamptz;
