-- 0098_notifications_archived_at.sql
-- Soft-archive for innboks-varsler (#616).
--
-- Brukeren kan nå arkivere et varsel (✕ per kort) eller tømme alle leste
-- («Tøm leste»). Vi sletter aldri rader — `archived_at` skjuler dem fra
-- /innboks-lista, men historikken beholdes i DB. Arkivering settes sammen
-- med `read_at` i app-laget, så en arkivert-mens-ulest rad ikke etterlater
-- en hengende bunn-nav-prikk.
--
-- Ingen ny RLS-policy: en `archived_at`-UPDATE dekkes av den eksisterende
-- `notifications_update_own`-policyen (user_id = auth.uid()). `useUnread-
-- NotificationsCount` ignorerer DELETE-events bevisst, så soft-archive
-- krever heller ingen hook-endring.

alter table public.notifications
  add column archived_at timestamptz;

-- Den dominante innboks-queryen filtrerer nå alltid `archived_at is null`
-- (aktive varsler, sortert på created_at desc). Partial-indeks holder den
-- indeks-dekket — konsistent med fil-ens eksisterende partial-index-mønster
-- (`notifications_user_unread_created`).
create index notifications_user_active_created
  on public.notifications(user_id, created_at desc)
  where archived_at is null;
