-- supabase/tests/users_anonymize_sole_club_owner_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Runtime test for migration 0176 (#1910): the sole owner of a club that has
-- other members cannot be anonymized — the club would be left without an owner.
--
-- Why the guard lives in anonymize_user: 0110's last-owner trigger lets
-- service_role through on purpose (auth.uid() is null), and anonymize_user runs
-- as service_role. So the RPC itself has to refuse.
--
-- Called without impersonation, like users_anonymize_withdrawal_test.sql:
-- auth.uid() is NULL here, which is exactly the production service-role path.
--
-- Fixtures live in their own `torny_sco` schema so they cannot collide with
-- `torny_rls` or `torny_wd`.
--
-- Run via: supabase test db   (or `npm run test:rls`)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

-- ── Fixture ids ──────────────────────────────────────────────────────────────
create schema if not exists torny_sco;

create or replace function torny_sco.sole_owner_id()  returns uuid language sql immutable as $$ select '00000000-0000-4000-c000-000000000001'::uuid $$; -- sole owner, club has another member
create or replace function torny_sco.co_owner_a_id() returns uuid language sql immutable as $$ select '00000000-0000-4000-c000-000000000002'::uuid $$; -- one of two owners
create or replace function torny_sco.co_owner_b_id() returns uuid language sql immutable as $$ select '00000000-0000-4000-c000-000000000003'::uuid $$;
create or replace function torny_sco.solo_owner_id()  returns uuid language sql immutable as $$ select '00000000-0000-4000-c000-000000000004'::uuid $$; -- sole owner AND only member
create or replace function torny_sco.club_admin_id()  returns uuid language sql immutable as $$ select '00000000-0000-4000-c000-000000000005'::uuid $$; -- role 'admin' in the club
create or replace function torny_sco.member_id()      returns uuid language sql immutable as $$ select '00000000-0000-4000-c000-000000000006'::uuid $$; -- role 'member' in the club
create or replace function torny_sco.no_club_id()     returns uuid language sql immutable as $$ select '00000000-0000-4000-c000-000000000007'::uuid $$; -- no club membership at all

create or replace function torny_sco.club_id()      returns uuid language sql immutable as $$ select '00000000-0000-4000-c000-00000000a001'::uuid $$;
create or replace function torny_sco.co_club_id()   returns uuid language sql immutable as $$ select '00000000-0000-4000-c000-00000000a002'::uuid $$;
create or replace function torny_sco.solo_club_id() returns uuid language sql immutable as $$ select '00000000-0000-4000-c000-00000000a003'::uuid $$;

-- try_anonymize(target): TRUE if anonymize_user went through, FALSE if it
-- raised. The exception block is a subtransaction, so a refused call writes
-- nothing and does not abort the pgTAP transaction.
create or replace function torny_sco.try_anonymize(p_user_id uuid) returns boolean
  language plpgsql as $$
  begin
    perform public.anonymize_user(p_user_id);
    return true;
  exception
    when raise_exception then return false;  -- P0001 sole_club_owner
  end;
$$;

-- ── Seed ─────────────────────────────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email)
select id, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', email
  from (values
    (torny_sco.sole_owner_id(),  'sco-sole-owner@example.test'),
    (torny_sco.co_owner_a_id(),  'sco-co-owner-a@example.test'),
    (torny_sco.co_owner_b_id(),  'sco-co-owner-b@example.test'),
    (torny_sco.solo_owner_id(),  'sco-solo-owner@example.test'),
    (torny_sco.club_admin_id(),  'sco-club-admin@example.test'),
    (torny_sco.member_id(),      'sco-member@example.test'),
    (torny_sco.no_club_id(),     'sco-no-club@example.test')
  ) as v(id, email);

-- handle_new_auth_user already inserted matching public.users rows; make sure
-- none of them is a global admin (anonymize_user refuses those first).
insert into public.users (id, email, name, is_admin)
select id, email, 'SCO ' || email, false from auth.users
 where id in (torny_sco.sole_owner_id(), torny_sco.co_owner_a_id(), torny_sco.co_owner_b_id(),
              torny_sco.solo_owner_id(), torny_sco.club_admin_id(), torny_sco.member_id(),
              torny_sco.no_club_id())
on conflict (id) do update set email = excluded.email, name = excluded.name, is_admin = false;

insert into public.groups (id, name, created_by) values
  (torny_sco.club_id(),      'SCO Club',      torny_sco.sole_owner_id()),
  (torny_sco.co_club_id(),   'SCO Co Club',   torny_sco.co_owner_a_id()),
  (torny_sco.solo_club_id(), 'SCO Solo Club', torny_sco.solo_owner_id());

insert into public.group_members (group_id, user_id, role) values
  -- sole owner + an admin + a member
  (torny_sco.club_id(),      torny_sco.sole_owner_id(), 'owner'),
  (torny_sco.club_id(),      torny_sco.club_admin_id(), 'admin'),
  (torny_sco.club_id(),      torny_sco.member_id(),     'member'),
  -- two owners
  (torny_sco.co_club_id(),   torny_sco.co_owner_a_id(), 'owner'),
  (torny_sco.co_club_id(),   torny_sco.co_owner_b_id(), 'owner'),
  -- owner alone in their club
  (torny_sco.solo_club_id(), torny_sco.solo_owner_id(), 'owner');

-- ── 1–5. is_sole_club_owner ─────────────────────────────────────────────────
select is(public.is_sole_club_owner(torny_sco.sole_owner_id()), true,
  '#1910: sole owner of a club with other members is a sole club owner');
select is(public.is_sole_club_owner(torny_sco.co_owner_a_id()), false,
  '#1910: one of two owners is not a sole club owner');
select is(public.is_sole_club_owner(torny_sco.solo_owner_id()), false,
  '#1910: sole owner who is also the only member is not blocked (nobody to hand over to)');
select is(public.is_sole_club_owner(torny_sco.club_admin_id()) or public.is_sole_club_owner(torny_sco.member_id()), false,
  '#1910: club admin and member roles are never sole club owners');
select is(public.is_sole_club_owner(torny_sco.no_club_id()), false,
  '#1910: an account with no club membership is not a sole club owner');

-- ── 6–8. anonymize_user refuses the sole owner and writes nothing ──────────
select is(torny_sco.try_anonymize(torny_sco.sole_owner_id()), false,
  '#1910: anonymize_user raises sole_club_owner for the sole owner');
select throws_ok(
  format('select public.anonymize_user(%L::uuid)', torny_sco.sole_owner_id()),
  'P0001', 'sole_club_owner',
  '#1910: the refusal carries the sole_club_owner message'
);
select ok(
  exists(select 1 from public.group_members
          where group_id = torny_sco.club_id() and user_id = torny_sco.sole_owner_id() and role = 'owner')
  and (select deleted_at from public.users where id = torny_sco.sole_owner_id()) is null,
  '#1910: after the refusal the club still has its owner and the account is not anonymized'
);

-- The call and its check are SEPARATE statements on purpose: a statement's
-- snapshot is taken when it starts, so a subquery in the same statement as
-- try_anonymize() cannot see what anonymize_user just wrote.

-- ── 9–10. Solo club: goes through, membership gone ──────────────────────────
select is(torny_sco.try_anonymize(torny_sco.solo_owner_id()), true,
  '#1910: sole owner alone in their club is anonymized');
select ok(
  not exists(select 1 from public.group_members where user_id = torny_sco.solo_owner_id()),
  '#1910: the solo owner''s membership is removed'
);

-- ── 11–12. Ordinary member of a club with an owner: goes through ────────────
select is(torny_sco.try_anonymize(torny_sco.member_id()), true,
  '#1910: an ordinary member is anonymized as before');
select isnt(
  (select deleted_at from public.users where id = torny_sco.member_id()),
  null,
  '#1910: the ordinary member is marked deleted'
);

-- ── 13–14. One of two owners: goes through, the other owner remains ─────────
select is(torny_sco.try_anonymize(torny_sco.co_owner_a_id()), true,
  '#1910: one of two owners is anonymized');
select ok(
  exists(select 1 from public.group_members
          where group_id = torny_sco.co_club_id() and user_id = torny_sco.co_owner_b_id() and role = 'owner'),
  '#1910: the club keeps its other owner'
);

select * from finish();
rollback;
