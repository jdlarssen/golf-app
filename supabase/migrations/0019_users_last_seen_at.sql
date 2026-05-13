-- Add last_seen_at to public.users for activity tracking.
-- Updated by proxy.ts (Next.js middleware) at most once per 30 minutes
-- per authenticated request. Best-effort — request is never blocked on failure.
alter table public.users
  add column if not exists last_seen_at timestamptz;

-- Index for admin queries (e.g. sort by activity).
create index if not exists users_last_seen_at_idx
  on public.users (last_seen_at desc nulls last);
