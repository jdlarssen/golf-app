-- 0035_product_updates.sql
-- Produkt-oppdateringer (issue #202): in-app drypp + månedlig mail-digest.
--
-- To nye tabeller + én ny user-kolonne + utvidelse av notifications.kind-CHECK.
--   product_updates           - authoritative source per publisert lansering
--   product_update_digests    - audit + idempotens for månedlig mail-utsending
--   users.product_updates_unsubscribed_at - per-bruker opt-out timestamp
--
-- Fan-out til alle brukere skjer via notifications-tabellen (eksisterende
-- innboks-infra). Mail-digest leser kun fra product_updates + filtrerer
-- recipients på unsubscribed_at IS NULL.

-- Authoritative source: én rad per publisert lansering. Admin-curated.
create table public.product_updates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  link text,
  cta_label text,
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index product_updates_created_at_desc
  on public.product_updates(created_at desc);

-- Audit + idempotens for månedlig digest-utsending. UNIQUE på periode
-- forhindrer dobbel-send hvis cron + admin trykker samtidig.
create table public.product_update_digests (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  sent_at timestamptz not null default now(),
  sent_by uuid references public.users(id) on delete set null,
  recipient_count int not null,
  update_ids uuid[] not null,
  unique (period_start, period_end)
);

-- Opt-out for månedlig mail. Timestamp i stedet for boolean = audit + trivial re-opt-in.
alter table public.users
  add column if not exists product_updates_unsubscribed_at timestamptz;

-- Utvid notifications.kind-CHECK med 'product_update'. Atomær drop + re-add.
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in (
    'invite',
    'peer_approval_request',
    'scorecard_submitted',
    'scorecard_approved',
    'game_finished',
    'product_update'
  ));

-- RLS for product_updates: alle innloggede ser (banner + admin-historikk
-- gjenbruker samme query). INSERT/UPDATE/DELETE kun via service-role
-- (admin-client) — ingen klient-policy.
alter table public.product_updates enable row level security;

create policy product_updates_select_authenticated
  on public.product_updates for select
  to authenticated
  using (true);

-- RLS for product_update_digests: ingen klient-policy. UI leser via
-- server-action med admin-client.
alter table public.product_update_digests enable row level security;
