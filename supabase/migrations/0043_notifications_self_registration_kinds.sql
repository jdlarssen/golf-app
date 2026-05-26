-- 0042_notifications_self_registration_kinds.sql
-- Utvid notifications.kind-CHECK med 5 nye varsel-typer for selv-påmelding (issue #199).
--
-- Samme atomær drop+add-mønster som 0035 (product_update). Zod-schemas
-- for hver kind ligger i lib/notifications/types.ts og valideres før insert.

alter table public.notifications drop constraint notifications_kind_check;

alter table public.notifications add constraint notifications_kind_check
  check (kind in (
    'invite',
    'peer_approval_request',
    'scorecard_submitted',
    'scorecard_approved',
    'game_finished',
    'product_update',
    -- Nye for #199:
    'team_invite',              -- kapteinen inviterer kjent bruker til lag
    'registration_request',     -- noen ber om å bli med (til admin/creator)
    'registration_approved',    -- admin godkjente forespørsel
    'registration_rejected',    -- admin avslo forespørsel
    'team_member_withdrew'      -- medspiller trakk seg pre-start
  ));
