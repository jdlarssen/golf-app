-- 0032_notifications.sql
-- In-app innboks for varsler (issue #25).
--
-- Polymorf tabell med kind-discriminator og JSONB-payload. Payload-shape
-- per kind valideres i TypeScript-laget via Zod før insert (ingen DB-CHECK
-- på struktur — gjør utvidelse til nye kind-verdier billig).
--
-- RLS: hver bruker ser/oppdaterer kun sine egne rader. Inserts skjer via
-- server-actions med admin-client (ingen klient-insert-policy).

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (kind in (
    'invite',
    'peer_approval_request',
    'scorecard_submitted',
    'scorecard_approved',
    'game_finished'
  )),
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- Partial index for ulest-teller + listevisning (vanligste query).
create index notifications_user_unread_created
  on public.notifications(user_id, created_at desc)
  where read_at is null;

-- Full historikk-index for /innboks-listen (uleste + leste sortert).
create index notifications_user_created
  on public.notifications(user_id, created_at desc);

-- Aktiver RLS.
alter table public.notifications enable row level security;

-- Spillere ser kun egne varsler.
create policy notifications_select_own
  on public.notifications for select
  using (user_id = auth.uid());

-- Spillere oppdaterer kun egne (for read_at-mutasjon via «marker som lest»).
-- WITH CHECK forhindrer at user_id endres via update.
create policy notifications_update_own
  on public.notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Realtime: legg til i supabase_realtime-publikasjonen så NotificationBell
-- kan subbe til INSERT/UPDATE-events for live badge-oppdatering.
alter publication supabase_realtime add table public.notifications;
