-- supabase/migrations/0023_agent_monitoring.sql
-- Internal tables for the autonomous monitoring agent.
-- No RLS policies = no access for anon/authenticated.
-- Only service_role can read/write (agent uses service-key).

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  agent_kind text not null check (agent_kind in ('hourly', 'merge_watcher', 'morning_report')),
  duration_ms int,
  findings_count int not null default 0,
  notes text
);

create table public.agent_findings (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  detected_at timestamptz not null default now(),
  source text not null check (source in ('vercel', 'supabase_pg', 'supabase_auth', 'supabase_advisor', 'resend')),
  severity text not null check (severity in ('safe_fix', 'pr_worthy', 'needs_judgment')),
  fingerprint text not null,
  summary text not null,
  raw_payload jsonb,
  action_taken text check (action_taken in ('auto_pushed', 'pr_opened', 'reported', 'skipped_duplicate')),
  action_ref text,
  resolved_at timestamptz
);

create index agent_findings_fingerprint_idx on public.agent_findings (fingerprint, resolved_at);
create index agent_runs_ran_at_idx on public.agent_runs (ran_at desc);

alter table public.agent_runs enable row level security;
alter table public.agent_findings enable row level security;
