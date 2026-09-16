-- supabase/tests/users_admin_hard_delete_guard_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Runtime test for migration 0179 (#1903): a users row with is_admin = true
-- cannot be deleted — neither directly nor through the auth.users cascade that
-- `auth.admin.deleteUser(id)` (the hard-delete path) triggers.
--
-- Called without impersonation: auth.uid() is NULL here, which is exactly the
-- production service-role path the guard must NOT exempt.
--
-- Fixtures live in their own `torny_adm` schema so they cannot collide with the
-- other suites.
--
-- Run via: supabase test db   (or `npm run test:rls`)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

create schema if not exists torny_adm;

create or replace function torny_adm.admin_id()   returns uuid language sql immutable as $$ select '00000000-0000-4000-d000-000000000001'::uuid $$; -- global admin, no game history
create or replace function torny_adm.player_id()  returns uuid language sql immutable as $$ select '00000000-0000-4000-d000-000000000002'::uuid $$; -- ordinary account
create or replace function torny_adm.retired_id() returns uuid language sql immutable as $$ select '00000000-0000-4000-d000-000000000003'::uuid $$; -- admin that gets the flag cleared

-- ── Seed ─────────────────────────────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email)
select id, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', email
  from (values
    (torny_adm.admin_id(),   'adm-admin@example.test'),
    (torny_adm.player_id(),  'adm-player@example.test'),
    (torny_adm.retired_id(), 'adm-retired@example.test')
  ) as v(id, email);

-- handle_new_auth_user already inserted matching public.users rows.
insert into public.users (id, email, name, is_admin)
select id, email, 'ADM ' || email, id <> torny_adm.player_id() from auth.users
 where id in (torny_adm.admin_id(), torny_adm.player_id(), torny_adm.retired_id())
on conflict (id) do update set email = excluded.email, name = excluded.name, is_admin = excluded.is_admin;

-- ── 1. Direct delete of an admin row is refused ─────────────────────────────
select throws_ok(
  format('delete from public.users where id = %L::uuid', torny_adm.admin_id()),
  '42501', null,
  '#1903: deleting a public.users row with is_admin = true raises insufficient_privilege'
);

-- ── 2–3. The hard-delete path (auth.users cascade) is refused, both rows stay ─
select throws_ok(
  format('delete from auth.users where id = %L::uuid', torny_adm.admin_id()),
  '42501', null,
  '#1903: deleting the admin from auth.users raises through the cascade'
);
select ok(
  exists(select 1 from auth.users where id = torny_adm.admin_id())
  and exists(select 1 from public.users where id = torny_adm.admin_id() and is_admin),
  '#1903: after the refused cascade both the auth row and the public row remain'
);

-- ── 4–5. An ordinary account still hard-deletes through the cascade ─────────
select lives_ok(
  format('delete from auth.users where id = %L::uuid', torny_adm.player_id()),
  '#1903: a non-admin account still hard-deletes via auth.users'
);
select ok(
  not exists(select 1 from public.users where id = torny_adm.player_id()),
  '#1903: the cascade removed the non-admin public.users row'
);

-- ── 6–7. Clearing is_admin first is the way to retire an admin account ──────
update public.users set is_admin = false where id = torny_adm.retired_id();
select lives_ok(
  format('delete from auth.users where id = %L::uuid', torny_adm.retired_id()),
  '#1903: once is_admin is cleared the account can be deleted'
);
select ok(
  not exists(select 1 from auth.users where id = torny_adm.retired_id())
  and not exists(select 1 from public.users where id = torny_adm.retired_id()),
  '#1903: the retired admin is gone from both schemas'
);

-- ── 8. anonymize_user still refuses the admin (regression guard) ────────────
select throws_ok(
  format('select public.anonymize_user(%L::uuid)', torny_adm.admin_id()),
  '42501', 'admin accounts cannot be anonymized (public.users.is_admin)',
  '#1903: anonymize_user still refuses an admin account'
);

-- ── 9. The guard function is not exposed as an RPC ───────────────────────────
select ok(
  not has_function_privilege('authenticated', 'public.guard_users_admin_delete()', 'execute')
  and not has_function_privilege('anon', 'public.guard_users_admin_delete()', 'execute'),
  '#1903: anon/authenticated cannot execute the trigger function directly'
);

select * from finish();
rollback;
