-- supabase/tests/prod_vakt_hardening_1121_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Catalog-based test for migration 0137 (#1121) — security hardening from
-- prod-vaktas first run. Two advisory classes:
--   Part 1: 6 SECURITY INVOKER helpers got a locked search_path.
--   Part 2: SECURITY DEFINER EXECUTE surface scoped per-function.
--
-- Assertions use has_function_privilege(), which reflects EFFECTIVE
-- executability (including grants inherited via PUBLIC) — the same thing the
-- Supabase advisor checks. A bare information_schema grant check would miss a
-- lingering PUBLIC grant, so we deliberately use the effective form here.
--
-- The behavioral invariant — trigger functions keep firing after their EXECUTE
-- grant is revoked (trigger dispatch does not check caller EXECUTE) — is proven
-- by the sibling RLS suites (scores_write_rls_test.sql, users_self_update_rls_
-- test.sql, game_players_update_rls_test.sql, …) running in the same
-- `supabase test db` pass against a DB with 0137 applied: if a revoke had
-- disabled a guard, those hostile-update tests would fail.
--
-- rls_auto_enable() is intentionally NOT asserted: it is a prod-only event
-- trigger (absent from local/staging), revoked under an existence-guard in 0137.
--
-- Run via: supabase test db
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(28);

-- ── Part 1: locked search_path on the 6 flagged SECURITY INVOKER helpers ──────
select ok((select proconfig::text like '%search_path%' from pg_proc where oid = 'public.generate_friend_code()'::regprocedure),
  '#1121: generate_friend_code() has locked search_path');
select ok((select proconfig::text like '%search_path%' from pg_proc where oid = 'public.generate_game_short_id()'::regprocedure),
  '#1121: generate_game_short_id() has locked search_path');
select ok((select proconfig::text like '%search_path%' from pg_proc where oid = 'public.generate_group_short_id()'::regprocedure),
  '#1121: generate_group_short_id() has locked search_path');
select ok((select proconfig::text like '%search_path%' from pg_proc where oid = 'public.set_updated_at()'::regprocedure),
  '#1121: set_updated_at() has locked search_path');
select ok((select proconfig::text like '%search_path%' from pg_proc where oid = 'public.slugify_course_name(text)'::regprocedure),
  '#1121: slugify_course_name(text) has locked search_path');
select ok((select proconfig::text like '%search_path%' from pg_proc where oid = 'public.upsert_score_if_newer(uuid,uuid,integer,integer,uuid,timestamptz,integer)'::regprocedure),
  '#1121: upsert_score_if_newer(...) has locked search_path');

-- ── Part 2a: trigger functions — no client (anon/authenticated) EXECUTE ───────
select ok(not has_function_privilege('anon', 'public.guard_game_players_invite_eligibility()', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.guard_game_players_invite_eligibility()', 'EXECUTE'),
  '#1121: guard_game_players_invite_eligibility not client-executable');
select ok(not has_function_privilege('anon', 'public.guard_game_players_score_differential()', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.guard_game_players_score_differential()', 'EXECUTE'),
  '#1121: guard_game_players_score_differential not client-executable');
select ok(not has_function_privilege('anon', 'public.guard_game_players_self_update()', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.guard_game_players_self_update()', 'EXECUTE'),
  '#1121: guard_game_players_self_update not client-executable');
select ok(not has_function_privilege('anon', 'public.guard_group_join_requests_self_update()', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.guard_group_join_requests_self_update()', 'EXECUTE'),
  '#1121: guard_group_join_requests_self_update not client-executable');
select ok(not has_function_privilege('anon', 'public.guard_group_members_last_owner_delete()', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.guard_group_members_last_owner_delete()', 'EXECUTE'),
  '#1121: guard_group_members_last_owner_delete not client-executable');
select ok(not has_function_privilege('anon', 'public.guard_invitations_self_update()', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.guard_invitations_self_update()', 'EXECUTE'),
  '#1121: guard_invitations_self_update not client-executable');
select ok(not has_function_privilege('anon', 'public.guard_scores_self_update()', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.guard_scores_self_update()', 'EXECUTE'),
  '#1121: guard_scores_self_update not client-executable');
select ok(not has_function_privilege('anon', 'public.guard_users_self_update()', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.guard_users_self_update()', 'EXECUTE'),
  '#1121: guard_users_self_update not client-executable');
select ok(not has_function_privilege('anon', 'public.handle_new_auth_user()', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.handle_new_auth_user()', 'EXECUTE'),
  '#1121: handle_new_auth_user not client-executable');

-- ── Part 2b: consume_admin_rate_limit — anon revoked; authenticated + service_role kept ─
-- Login/self-reg limiters call it via service-role; the admin-invite limiter
-- (lib/admin/rateLimit.ts) calls it via the signed-in admin's own client, so
-- authenticated must keep EXECUTE. anon is never a caller.
select ok(not has_function_privilege('anon', 'public.consume_admin_rate_limit(text,integer,integer)', 'EXECUTE')
      and has_function_privilege('authenticated', 'public.consume_admin_rate_limit(text,integer,integer)', 'EXECUTE'),
  '#1121: consume_admin_rate_limit anon-revoked, authenticated kept (admin-invite limiter)');
select ok(has_function_privilege('service_role', 'public.consume_admin_rate_limit(text,integer,integer)', 'EXECUTE'),
  '#1121: consume_admin_rate_limit STILL executable by service_role (login/registration limiter)');

-- ── Part 2c: authenticated-only RPCs/helpers — anon revoked, authenticated kept ─
select ok(not has_function_privilege('anon', 'public.create_course_with_layout(text,jsonb,jsonb)', 'EXECUTE')
      and has_function_privilege('authenticated', 'public.create_course_with_layout(text,jsonb,jsonb)', 'EXECUTE'),
  '#1121: create_course_with_layout anon-revoked, authenticated kept');
select ok(not has_function_privilege('anon', 'public.email_is_registered(text)', 'EXECUTE')
      and has_function_privilege('authenticated', 'public.email_is_registered(text)', 'EXECUTE'),
  '#1121: email_is_registered anon-revoked (fixes #671 drift), authenticated kept');
select ok(not has_function_privilege('anon', 'public.can_react_in_game(uuid)', 'EXECUTE')
      and has_function_privilege('authenticated', 'public.can_react_in_game(uuid)', 'EXECUTE'),
  '#1121: can_react_in_game anon-revoked, authenticated kept');
select ok(not has_function_privilege('anon', 'public.league_group_id(uuid)', 'EXECUTE')
      and has_function_privilege('authenticated', 'public.league_group_id(uuid)', 'EXECUTE'),
  '#1121: league_group_id anon-revoked, authenticated kept');
-- same_flight(uuid,uuid) was dropped in 0139 (#1129) — dead helper, superseded
-- by same_flight_or_solo/can_score_for. Assert it is gone rather than gating it.
select hasnt_function('public', 'same_flight', array['uuid','uuid'],
  '#1129: same_flight dropped — dead helper, superseded by same_flight_or_solo');

-- ── Part 2d: anon-reachable RLS helpers must KEEP anon EXECUTE ─────────────────
-- These are referenced by {public} policies; revoking anon would break anon
-- queries with "permission denied for function" before RLS can deny. email_is_
-- invited is the pre-login gate. This block guards against over-revocation.
select ok(has_function_privilege('anon', 'public.email_is_invited(text)', 'EXECUTE'),
  '#1121: email_is_invited STILL anon-executable (pre-login shouldCreateUser gate)');
select ok(has_function_privilege('anon', 'public.is_admin()', 'EXECUTE'),
  '#1121: is_admin STILL anon-executable ({public} policies)');
select ok(has_function_privilege('anon', 'public.same_flight_or_solo(uuid,uuid)', 'EXECUTE'),
  '#1121: same_flight_or_solo STILL anon-executable (scores {public} SELECT)');
select ok(has_function_privilege('anon', 'public.can_score_for(uuid,uuid)', 'EXECUTE'),
  '#1121: can_score_for STILL anon-executable (scores {public} INSERT/UPDATE)');
select ok(has_function_privilege('anon', 'public.is_in_game(uuid)', 'EXECUTE'),
  '#1121: is_in_game STILL anon-executable (game_players {public} SELECT)');
select ok(has_function_privilege('anon', 'public.is_game_creator_or_admin(uuid)', 'EXECUTE'),
  '#1121: is_game_creator_or_admin STILL anon-executable (game_registration_requests {public})');

select * from finish();
rollback;
