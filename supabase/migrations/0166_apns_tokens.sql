-- 0166_apns_tokens.sql
-- #1282: APNs device tokens for the iOS shell, one row per device. Sister table
-- to push_subscriptions (0116) rather than a column extension so the web-push
-- table (and its #24 pipeline) stays untouched. notify() -> sendPushToUser fans
-- out to BOTH tables; this one is purely opt-in and writer-less until the shell
-- code ships, so it is safe to apply before the code deploy.

create table public.apns_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  token        text not null unique,
  -- 'sandbox' | 'production'. Null until the server has learned which APNs
  -- environment answers for this token (dev builds get sandbox tokens,
  -- TestFlight/App Store get production; the client cannot read its own
  -- entitlement, so the sender self-heals and persists the answer here).
  environment  text check (environment in ('sandbox', 'production')),
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

create index apns_tokens_user_idx on public.apns_tokens (user_id);

comment on table public.apns_tokens is
  'APNs device token per iOS-shell device (#1282). One user -> many rows. '
  'notify() fans out a native push to these when the user is off-app, next to '
  'the web-push fan-out over push_subscriptions.';

alter table public.apns_tokens enable row level security;

-- RLS: a user manages only their own device rows. user_id is set server-side
-- from the session, never from client payload. (Mirror of the 0116 policies.)
create policy "apns_tokens own select"
  on public.apns_tokens for select to authenticated
  using (auth.uid() = user_id);

create policy "apns_tokens own insert"
  on public.apns_tokens for insert to authenticated
  with check (auth.uid() = user_id);

create policy "apns_tokens own update"
  on public.apns_tokens for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "apns_tokens own delete"
  on public.apns_tokens for delete to authenticated
  using (auth.uid() = user_id);
