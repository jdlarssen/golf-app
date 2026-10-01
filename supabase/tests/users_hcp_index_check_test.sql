-- supabase/tests/users_hcp_index_check_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK integration test: users.hcp_index range (#2222, migration 0196).
--
-- The "users update own" RLS policy checks only whose row it is, and
-- guard_users_self_update never looks at hcp_index. Before 0196 a player could
-- PATCH their own row to hcp_index = 999.9; the only bound was HCP_MIN /
-- HCP_MAX in TypeScript. The CHECK users_hcp_index_range now refuses it at the
-- layer a direct request cannot bypass.
--
--   FORBIDDEN (a player, via a direct UPDATE on their OWN row):
--     1. hcp_index = 999.9   → 23514 (check_violation)
--     2. hcp_index = -10.1   → 23514
--
--   ALLOWED (the bounds themselves):
--     3. hcp_index = 54      → lives
--     4. (sanity, read as the service role) the row now holds 54
--     5. hcp_index = -10     → lives
--     6. (sanity, read as the service role) the row now holds -10
--
-- The write and the check are separate statements (#1910: a function's
-- snapshot would not see its own update). Runs as `authenticated` with a
-- forged JWT `sub` claim — the runtime path the app uses. See
-- supabase/tests/README.md for how to run.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

\ir fixtures/rls_helpers.psql

select torny_rls.as_service();
select torny_rls.seed_active_game();

-- ═════════════════════════════════════════════════════════════════════════════
-- FORBIDDEN — absurd values are refused by the CHECK
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.active_id());

select throws_ok(
  $$ update public.users set hcp_index = 999.9 where id = torny_rls.active_id() $$,
  '23514',
  null,
  'a player CANNOT set their own hcp_index to 999.9 (users_hcp_index_range)'
);

select throws_ok(
  $$ update public.users set hcp_index = -10.1 where id = torny_rls.active_id() $$,
  '23514',
  null,
  'a player CANNOT set their own hcp_index to -10.1 (users_hcp_index_range)'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- ALLOWED — the bounds themselves are valid handicaps
-- ═════════════════════════════════════════════════════════════════════════════
select lives_ok(
  $$ update public.users set hcp_index = 54 where id = torny_rls.active_id() $$,
  'a player CAN set their own hcp_index to the WHS ceiling 54'
);

select torny_rls.as_service();

select is(
  (select hcp_index from public.users where id = torny_rls.active_id()),
  54.0::numeric,
  'hcp_index holds 54 after the write (the update reached the row)'
);

select torny_rls.as_user(torny_rls.active_id());

select lives_ok(
  $$ update public.users set hcp_index = -10 where id = torny_rls.active_id() $$,
  'a player CAN set their own hcp_index to -10 (plus 10)'
);

select torny_rls.as_service();

select is(
  (select hcp_index from public.users where id = torny_rls.active_id()),
  -10.0::numeric,
  'hcp_index holds -10 after the write'
);

select * from finish();
rollback;
