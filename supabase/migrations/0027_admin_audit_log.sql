-- Append-only audit trail for sensitive admin overrides.
--
-- Per issue #39: capture *who* ended a game and *who* approved a scorecard,
-- so the data trail survives later edits and post-incident questions can be
-- answered without grep-ing Vercel logs. Reopen-flows (game + scorecard) get
-- the same treatment since they're equally sensitive overrides.
--
-- Design notes:
--   - `actor_user_id` is FK → public.users with `on delete set null`, so a
--     later player-delete doesn't break log integrity. `actor_name` is a
--     snapshot of the admin's display name at write-time — it survives
--     rename and delete, and reads correctly when the FK row is gone.
--   - `event_type` is freeform text rather than an enum so new events can
--     be added without a migration. Caller-side type discipline (see
--     `lib/admin/auditLog.ts`) keeps the values in sync with code intent.
--   - `payload` is JSONB for event-specific context (game name, scorecard
--     player, etc.) without committing to a column schema per event type.
--   - Table is closed to anon + authenticated. Inserts happen via the
--     service-role admin client from server actions; reads happen via SQL
--     editor for forensics today (a future viewer can layer on top).

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_user_id uuid references public.users(id) on delete set null,
  actor_name text not null,
  event_type text not null,
  target_type text,
  target_id uuid,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists admin_audit_log_actor_idx
  on public.admin_audit_log(actor_user_id, created_at desc);
create index if not exists admin_audit_log_event_idx
  on public.admin_audit_log(event_type, created_at desc);
create index if not exists admin_audit_log_target_idx
  on public.admin_audit_log(target_type, target_id)
  where target_id is not null;

alter table public.admin_audit_log enable row level security;

revoke all on public.admin_audit_log from anon, authenticated;
