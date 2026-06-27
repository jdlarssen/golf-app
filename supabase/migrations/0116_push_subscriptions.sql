-- 0116_push_subscriptions.sql
-- #24: Web Push subscriptions, one row per device. A user may have several.
-- `notify()` reads these (admin client) to send a push when the user is off-app;
-- push is ADDITIVE on top of today's email, so this table is purely opt-in and
-- safe to apply before the code deploy (no writer exists until the client ships).

create table public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

comment on table public.push_subscriptions is
  'Web Push subscription per device (#24). One user -> many rows. notify() fans '
  'out a push to these when the user is off-app, in addition to email.';

alter table public.push_subscriptions enable row level security;

-- RLS: a user manages only their own device rows. user_id is set server-side
-- from the session, never from client payload.
create policy "push_subscriptions own select"
  on public.push_subscriptions for select to authenticated
  using (auth.uid() = user_id);

create policy "push_subscriptions own insert"
  on public.push_subscriptions for insert to authenticated
  with check (auth.uid() = user_id);

create policy "push_subscriptions own update"
  on public.push_subscriptions for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "push_subscriptions own delete"
  on public.push_subscriptions for delete to authenticated
  using (auth.uid() = user_id);
