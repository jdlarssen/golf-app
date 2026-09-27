-- supabase/tests/profile_gate_rpc_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- The profile gate answers with ids only (#2207, migration 0185).
--
-- incomplete_profile_ids(uuid[]) is what the publish gate and the round-start
-- gate ask: "which of these roster members have not finished their profile?".
-- The old incomplete_profiles_for_ids(uuid[]) stays for store builds up to and
-- including 1.1.0 (3), which call it at publish time and read only the row
-- count; since 0185 it answers email = null.
--
--   1. incomplete_profile_ids returns a single id column
--   2. …and only the unfinished ids among the ones passed in
--   3. incomplete_profiles_for_ids still returns the unfinished rows
--   4. …with email null on every row
--   5. authenticated keeps EXECUTE on the old function (old store builds)
--   6. service_role has EXECUTE on incomplete_profile_ids (the cron start)
--   7. anon has no EXECUTE on incomplete_profile_ids
--
-- Depends on 0185 only. Run via: supabase test db (see supabase/tests/README.md)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

\ir fixtures/rls_helpers.psql

-- Seed: the shared rig; every rig user finished except outsider_id.
select torny_rls.as_service();
select torny_rls.seed_active_game();
update public.users set profile_completed_at = now() where id = any(torny_rls.all_user_ids());
update public.users set profile_completed_at = null where id = torny_rls.outsider_id();

select is(
  pg_get_function_result('public.incomplete_profile_ids(uuid[])'::regprocedure),
  'TABLE(id uuid)',
  'incomplete_profile_ids returns only an id column'
);

-- Called the way the app calls it: a signed-in organizer with a roster.
select torny_rls.as_user(torny_rls.active_id());

select results_eq(
  $$ select id from public.incomplete_profile_ids(array[torny_rls.active_id(), torny_rls.flightmate_id(), torny_rls.outsider_id()]) $$,
  $$ values (torny_rls.outsider_id()) $$,
  'incomplete_profile_ids returns only the unfinished ids among those passed in'
);

select results_eq(
  $$ select id from public.incomplete_profiles_for_ids(array[torny_rls.active_id(), torny_rls.outsider_id()]) $$,
  $$ values (torny_rls.outsider_id()) $$,
  'incomplete_profiles_for_ids still returns the unfinished rows (old builds count them)'
);

select is(
  (select count(*)::int from public.incomplete_profiles_for_ids(array[torny_rls.outsider_id()]) where email is not null),
  0,
  'incomplete_profiles_for_ids answers email = null on every row'
);

select torny_rls.as_service();

select ok(
  has_function_privilege('authenticated', 'public.incomplete_profiles_for_ids(uuid[])', 'execute'),
  'authenticated keeps EXECUTE on incomplete_profiles_for_ids (store builds up to 1.1.0 (3))'
);

select ok(
  has_function_privilege('service_role', 'public.incomplete_profile_ids(uuid[])', 'execute'),
  'service_role has EXECUTE on incomplete_profile_ids (scheduled start runs as the service role)'
);

select ok(
  not has_function_privilege('anon', 'public.incomplete_profile_ids(uuid[])', 'execute'),
  'anon has no EXECUTE on incomplete_profile_ids'
);

select * from finish();
rollback;
