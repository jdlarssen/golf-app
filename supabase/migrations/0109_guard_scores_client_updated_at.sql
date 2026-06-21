-- 0109_guard_scores_client_updated_at.sql
--
-- Security hardening (#803): scores.client_updated_at is the LWW key for
-- upsert_score_if_newer — a write is only applied if the incoming timestamp is
-- strictly greater than the stored one. There is no DB-level guard on the column,
-- so a participant can PATCH it to the far future (e.g. 2099), permanently freezing
-- all later legitimate strokes on that hole for that player — or, via the
-- `can_score_for` / same-flight RLS, poison a flight-mate's hole.
--
-- Fix: a BEFORE UPDATE trigger `guard_scores_self_update` that, for non-admin
-- non-service-role writes, rejects a client_updated_at that:
--   (a) moves BACKWARD relative to the existing row (non-monotonic), or
--   (b) is set more than clock_skew_tolerance ahead of now() (future poisoning).
--
-- Clock-skew tolerance is intentionally generous (5 minutes) to avoid false
-- positives from legitimate offline sync where the device clock may drift, or
-- where an offline queue item was captured a few minutes ago and is only now
-- draining. upsert_score_if_newer itself passes the *client-side* timestamp
-- verbatim, so a real offline write lands with a timestamp that is typically
-- a few seconds to at most a few minutes in the past — not 70 years in the future.
--
-- ⚠ CAUTION — RPC execution context
-- upsert_score_if_newer is `security invoker`, so it runs as the `authenticated`
-- role and is subject to this trigger. The timestamp values it passes are real
-- client-side timestamps captured by the sync worker, always close to now() — so
-- the trigger does NOT reject them. Only an explicit future-poisoning PATCH
-- (e.g. '2099-01-01') would exceed the tolerance.
--
-- The non-monotonic guard (a) is similarly safe: the RPC only writes when the new
-- timestamp is strictly > OLD (that's the whole point of LWW), so by the time the
-- trigger fires the incoming value is already greater than the stored one — the
-- guard passes.
--
-- Bypasses:
--   • auth.uid() IS NULL (service-role / internal admin client) → no-op
--   • public.is_admin() → no-op
--
-- ⚠ THIS MIGRATION MUST BE VERIFIED ON STAGING before merging to main.
-- The owner should confirm that normal scoring (insert via offline sync RPC +
-- direct score entry) still applies cleanly after applying this migration.
-- See PR description and issue #803.

create or replace function public.guard_scores_self_update()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
as $$
  declare
    -- 5-minute tolerance for clock skew and queued offline writes.
    -- Generous intentionally — only real far-future poisoning (e.g. 2099) is blocked.
    v_clock_skew_tolerance interval := interval '5 minutes';
  begin
    -- Service-role writes (no JWT) and global admins bypass the guard.
    if auth.uid() is null or public.is_admin() then
      return new;
    end if;

    -- (a) Non-monotonic guard: client_updated_at must not move backward.
    --     The LWW RPC already enforces this application-side, so this is a
    --     defence-in-depth catch for a raw PATCH that tries to roll back the
    --     timestamp (which would make the row look "old" and accept any future
    --     real write — a subtle griefing variant).
    if new.client_updated_at < old.client_updated_at then
      raise exception
        'client_updated_at may not move backward (scores LWW key is monotonic-only, scores.client_updated_at)'
        using errcode = 'insufficient_privilege';
    end if;

    -- (b) Future-poisoning guard: client_updated_at must not be set more than
    --     clock_skew_tolerance minutes ahead of the server clock.
    if new.client_updated_at > now() + v_clock_skew_tolerance then
      raise exception
        'client_updated_at too far in the future — possible LWW poisoning attempt (scores.client_updated_at)'
        using errcode = 'insufficient_privilege';
    end if;

    return new;
  end;
$$;

drop trigger if exists guard_scores_self_update on public.scores;
create trigger guard_scores_self_update
  before update on public.scores
  for each row execute function public.guard_scores_self_update();
