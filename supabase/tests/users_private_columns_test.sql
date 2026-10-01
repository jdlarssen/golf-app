-- supabase/tests/users_private_columns_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- users.email and users.friend_code are private (#2207, migration 0186).
--
-- RLS decides which users rows a caller sees; the column privileges decide
-- which columns. A co-player still reads the public columns of someone they
-- share a game with, but neither they nor the row's owner can select the two
-- identity columns through a user session.
--
--   1. a co-player reads id + name of another participant       → 1 row
--   2–4. email / friend_code / * of another participant          → 42501
--   5–6. email / friend_code of the caller's own row             → 42501
--   7. update … returning * on the own row                       → 42501
--   8. update … returning id on the own row                      → ok
--      (the profile save asks back `id` only)
--   9. anon selects email                                        → 42501
--  10. anon selects id, name                                     → ok (0 rows)
--  11–12. catalog: every other users column is SELECT-able for
--      authenticated and anon — a new column without a grant goes red here
--  13. catalog: email and friend_code are not
--
-- Depends on 0186. Run via: supabase test db (see supabase/tests/README.md)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

\ir fixtures/rls_helpers.psql

create or replace function torny_rls.pc_as_anon() returns void
  language plpgsql as $$
  begin
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', null, true);
  end;
$$;

grant execute on all functions in schema torny_rls to authenticated, anon, service_role;

-- Seed: active_id and flightmate_id share the rig's game.
select torny_rls.as_service();
select torny_rls.seed_active_game();

select torny_rls.as_user(torny_rls.active_id());

select is(
  (select count(*)::int from public.users where id = torny_rls.flightmate_id()),
  1,
  'a co-player still sees the other participant''s row (public columns)'
);

select throws_ok(
  $$ select email from public.users where id = torny_rls.flightmate_id() $$,
  '42501', null,
  'a co-player CANNOT select another participant''s email'
);

select throws_ok(
  $$ select friend_code from public.users where id = torny_rls.flightmate_id() $$,
  '42501', null,
  'a co-player CANNOT select another participant''s friend_code'
);

select throws_ok(
  $$ select * from public.users where id = torny_rls.flightmate_id() $$,
  '42501', null,
  'select * on users is refused (it includes the private columns)'
);

select throws_ok(
  $$ select email from public.users where id = torny_rls.active_id() $$,
  '42501', null,
  'not even the own email is selectable through a user session'
);

select throws_ok(
  $$ select friend_code from public.users where id = torny_rls.active_id() $$,
  '42501', null,
  'not even the own friend_code is selectable through a user session'
);

select throws_ok(
  $$ update public.users set name = name where id = torny_rls.active_id() returning * $$,
  '42501', null,
  'update … returning * on the own row is refused (a bare .select() after .update())'
);

select lives_ok(
  $$ update public.users set name = name where id = torny_rls.active_id() returning id $$,
  'update … returning id on the own row works (the profile save)'
);

select torny_rls.pc_as_anon();

select throws_ok(
  $$ select email from public.users $$,
  '42501', null,
  'anon CANNOT select email'
);

select lives_ok(
  $$ select id, name from public.users $$,
  'anon may still select the public columns (RLS returns no rows)'
);

select torny_rls.as_service();

-- The columns come from pg_attribute keyed on the relation, and the privilege
-- is checked by attnum. Over information_schema.columns the planner could run
-- has_column_privilege(..., 'public.users', <name>, ...) on auth.users columns
-- before the schema filter, and fail with 42703 «instance_id» depending on the
-- plan (#2222). Keyed like this there is no plan in which it sees another table.
select is(
  (select array_agg(a.attname::text order by a.attname)
     from pg_attribute a
    where a.attrelid = 'public.users'::regclass and a.attnum > 0 and not a.attisdropped
      and a.attname not in ('email', 'friend_code')
      and not has_column_privilege('authenticated', 'public.users'::regclass, a.attnum, 'SELECT')),
  null::text[],
  'authenticated can SELECT every users column except email and friend_code (a new column needs its own grant)'
);

select is(
  (select array_agg(a.attname::text order by a.attname)
     from pg_attribute a
    where a.attrelid = 'public.users'::regclass and a.attnum > 0 and not a.attisdropped
      and a.attname not in ('email', 'friend_code')
      and not has_column_privilege('anon', 'public.users'::regclass, a.attnum, 'SELECT')),
  null::text[],
  'anon can SELECT every users column except email and friend_code'
);

select is(
  array[
    has_column_privilege('authenticated', 'public.users', 'email', 'SELECT'),
    has_column_privilege('authenticated', 'public.users', 'friend_code', 'SELECT'),
    has_column_privilege('anon', 'public.users', 'email', 'SELECT'),
    has_column_privilege('anon', 'public.users', 'friend_code', 'SELECT')
  ],
  array[false, false, false, false],
  'email and friend_code are not SELECT-able for authenticated or anon'
);

select * from finish();
rollback;
