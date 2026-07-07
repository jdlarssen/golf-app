-- 0137 — Security hardening from prod-vakta's first run (#1121).
--
-- Two advisory classes, both real, reviewed per-function against live catalog
-- introspection (staging snwmueecmfqqdurxedxv + prod glofubopddkjhymcbaph
-- read-only, 2026-07-07), call-sites and RLS policies. NOT a blind revoke-sweep
-- (that is the #641-cluster failure mode). Deliberately-kept EXECUTE surfaces
-- are recorded in docs/loops/prod-vakta-baseline.txt with rationale.
--
-- Ground-truth notes that shaped this migration:
--   * anon holds full table grants on nearly every table (standard Supabase);
--     RLS is the only gate. A helper referenced by a {public} policy MUST keep
--     anon EXECUTE, else anon queries error with "permission denied for
--     function" before RLS can deny. Those are KEPT + baselined, not revoked.
--   * Most functions carry a PUBLIC grant (=X) AND explicit role grants, so a
--     bare "REVOKE FROM anon" leaves anon executing via PUBLIC. Where anon must
--     lose access we revoke PUBLIC too; the explicit authenticated/service_role
--     grants preserve legitimate callers.
--   * Trigger/event-trigger functions are invoked by the trigger mechanism,
--     which does NOT check the caller's EXECUTE privilege — revoking their whole
--     client surface removes them from /rest/v1/rpc while triggers keep firing.

-- ─────────────────────────────────────────────────────────────────────────────
-- Part 1 — function_search_path_mutable (6): lock search_path.
-- All six are SECURITY INVOKER and fully schema-qualify their public references
-- (verified via pg_get_functiondef), so search_path = '' (strictest) preserves
-- behavior. ALTER FUNCTION touches only the config setting, not body or ACL.
-- ─────────────────────────────────────────────────────────────────────────────
alter function public.generate_friend_code() set search_path = '';
alter function public.generate_game_short_id() set search_path = '';
alter function public.generate_group_short_id() set search_path = '';
alter function public.set_updated_at() set search_path = '';
alter function public.slugify_course_name(text) set search_path = '';
alter function public.upsert_score_if_newer(
  uuid, uuid, integer, integer, uuid, timestamp with time zone, integer
) set search_path = '';

-- ─────────────────────────────────────────────────────────────────────────────
-- Part 2a — trigger / event-trigger functions: remove the entire client RPC
-- surface. postgres (owner) and service_role (explicit grant) are retained;
-- triggers fire regardless. Clears BOTH the anon_ and authenticated_ advisory.
-- ─────────────────────────────────────────────────────────────────────────────
revoke execute on function public.guard_game_players_invite_eligibility() from public, anon, authenticated;
revoke execute on function public.guard_game_players_score_differential() from public, anon, authenticated;
revoke execute on function public.guard_game_players_self_update() from public, anon, authenticated;
revoke execute on function public.guard_group_join_requests_self_update() from public, anon, authenticated;
revoke execute on function public.guard_group_members_last_owner_delete() from public, anon, authenticated;
revoke execute on function public.guard_invitations_self_update() from public, anon, authenticated;
revoke execute on function public.guard_scores_self_update() from public, anon, authenticated;
revoke execute on function public.guard_users_self_update() from public, anon, authenticated;
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;

-- rls_auto_enable() is an event-trigger function present on prod but not staging
-- (schema drift — see follow-up issue). Guard so this migration is a safe no-op
-- where the function is absent.
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Part 2b — consume_admin_rate_limit: drop anon, keep authenticated + service_role.
-- Two legitimate caller classes: (1) login + self-registration rate-limits call
-- it via the service-role admin client (lib/auth/loginRateLimit.ts,
-- registrationRateLimit.ts); (2) the admin-invite rate-limit calls it via the
-- signed-in admin's own client (lib/admin/rateLimit.ts ← app/[locale]/admin/
-- spillere/actions.ts), so `authenticated` must keep EXECUTE or the invite flow
-- fail-opens its rate limit. anon is never a caller (the pre-login limiter uses
-- service_role). The authenticated_ advisory for this fn is therefore baselined.
-- Follow-up: routing the admin-invite limiter through the service-role client
-- would let us revoke authenticated too (separate issue).
-- ─────────────────────────────────────────────────────────────────────────────
revoke execute on function public.consume_admin_rate_limit(text, integer, integer) from public, anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- Part 2c — authenticated-only RPCs / helpers: drop anon, keep authenticated.
-- ─────────────────────────────────────────────────────────────────────────────
-- Authenticated server-action behind auth.getUser() gate; no PUBLIC grant.
revoke execute on function public.create_course_with_layout(text, jsonb, jsonb) from anon;
-- Authenticated call-sites only (invite + admin/spillere). Fixes drift: #671
-- intended anon-revoke (claimed migration 0009) but the live grant showed anon=X.
revoke execute on function public.email_is_registered(text) from anon;
-- RLS helpers referenced only by {authenticated} policies (or, for same_flight,
-- by no policy at all — superseded by same_flight_or_solo). They carry a PUBLIC
-- grant, so revoke PUBLIC + anon; the explicit authenticated grant is preserved.
revoke execute on function public.can_react_in_game(uuid) from public, anon;
revoke execute on function public.league_group_id(uuid) from public, anon;
revoke execute on function public.same_flight(uuid, uuid) from public, anon;
