-- Sliding-window counter for rate-limiting admin actions (invitations first).
--
-- Why: admin/spillere's sendInvitation + resendInvitation server actions
-- each cost one Resend mail (limited free-tier quota) and create a row in
-- public.invitations. Without a guard, a buggy script or compromised admin
-- session could burst-send the entire daily mail budget in seconds. This
-- table is the storage layer for a fixed-window counter — the RPC below is
-- the atomic check-and-increment used from server actions.
--
-- Design notes:
--   - Bucket keys are caller-defined (e.g. 'invite-admin:<uuid>',
--     'invite-ip:<ip>'). One row per logical bucket.
--   - Fixed-window (vs. sliding) for atomicity simplicity: the moment
--     window_start drifts past `now() - window_seconds` we reset count to 1
--     and shift the window forward in the same UPSERT.
--   - No client-side reads or writes — RLS is enabled but no policies are
--     defined, so direct table access is blocked for anon and authenticated.
--     The RPC is SECURITY DEFINER so the function runs with the postgres
--     role's privileges, bypassing the policy gap.

create table if not exists public.admin_action_rate_limit (
  bucket text primary key,
  count integer not null default 0,
  window_start timestamptz not null default now()
);

alter table public.admin_action_rate_limit enable row level security;

revoke all on public.admin_action_rate_limit from anon, authenticated;

create or replace function public.consume_admin_rate_limit(
  p_bucket text,
  p_max integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_count integer;
begin
  insert into public.admin_action_rate_limit(bucket, count, window_start)
  values (p_bucket, 1, v_now)
  on conflict (bucket) do update set
    count = case
      when admin_action_rate_limit.window_start
           < v_now - make_interval(secs => p_window_seconds)
        then 1
      else admin_action_rate_limit.count + 1
    end,
    window_start = case
      when admin_action_rate_limit.window_start
           < v_now - make_interval(secs => p_window_seconds)
        then v_now
      else admin_action_rate_limit.window_start
    end
  returning count into v_count;

  return v_count <= p_max;
end;
$$;

revoke all on function public.consume_admin_rate_limit(text, integer, integer)
  from anon, authenticated;
grant execute on function public.consume_admin_rate_limit(text, integer, integer)
  to authenticated;
