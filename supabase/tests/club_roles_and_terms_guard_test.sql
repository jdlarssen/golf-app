-- supabase/tests/club_roles_and_terms_guard_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- RLS / trigger integration test for migration 0248: club roles and agreement
-- terms live in the database.
--
-- Rules under test, each with a direct request as the `authenticated` role:
--   A. Owner role: only an owner (or a global admin) gives or removes it.
--      Members are written by the RPCs, never by a direct insert.
--   B. Agreement terms (member_cap, valid_until) and the identity columns of
--      a club are set by a global admin (or the service role) only.
--   C. A club with a league or a cup cannot be deleted, so the league and the
--      cup keep their club scope.
--   D. The club of a league or a cup (group_id) is changed by a global admin
--      (or the service role) only.
--
-- Every probe returns what happened, and every assert names the exact outcome:
--   'ok'      the write landed
--   'no_rows' the statement ran but RLS left it nothing to change
--   a SQLSTATE (42501 = refused by a policy or a guard trigger, 23503 = foreign
--   key), or the RPC's own error text ('not_authorized').
-- An unrelated error therefore fails the assert instead of reading as refused.
--
-- Cast (all is_admin = FALSE except admin_id):
--   flightmate_id = owner · submitted_id = second owner · active_id = club admin
--   withdrawn_id  = member · outsider_id  = not in the club
--   active_id is also club admin of a second club and created one club cup and
--   one club league (section D).
--
-- Run via:  supabase test db
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(41);

\ir fixtures/rls_helpers.psql

-- ── Seed ──────────────────────────────────────────────────────────────────────
select torny_rls.as_service();
select torny_rls.seed_active_game();
select torny_rls.seed_group_join();

update public.groups set member_cap = 4 where id = torny_rls.group_id();
insert into public.group_members (group_id, user_id, role) values
  (torny_rls.group_id(), torny_rls.submitted_id(), 'owner'),
  (torny_rls.group_id(), torny_rls.active_id(),    'admin'),
  (torny_rls.group_id(), torny_rls.withdrawn_id(), 'member');

insert into public.leagues (id, name, season_start, season_end, standings_model, course_scope, created_by, group_id)
  values ('00000000-0000-4000-a000-0000000248a1', 'Club league 0248', '2026-01-01', '2026-12-31',
          'total', 'multi_course', torny_rls.admin_id(), torny_rls.group_id());
insert into public.tournaments (id, name, team_1_name, team_2_name, created_by, group_id)
  values ('00000000-0000-4000-a000-0000000248b1', 'Club cup 0248', 'A', 'B',
          torny_rls.admin_id(), torny_rls.group_id());

-- A second club without leagues or cups, for the delete rule.
insert into public.groups (id, name, created_by)
  values ('00000000-0000-4000-a000-0000000248e2', 'Empty club 0248', torny_rls.admin_id());
insert into public.group_members (group_id, user_id, role)
  values ('00000000-0000-4000-a000-0000000248e2', torny_rls.flightmate_id(), 'owner');

-- ── Probes: return 'ok', 'no_rows', a SQLSTATE or (RPCs) the error text ───────
create or replace function torny_rls.try_insert_member(p_target uuid, p_role public.group_role) returns text
  language plpgsql as $$
  begin
    insert into public.group_members (group_id, user_id, role)
      values (torny_rls.group_id(), p_target, p_role);
    return 'ok';
  exception when others then return sqlstate;
  end;
$$;

create or replace function torny_rls.try_delete_member(p_target uuid) returns text
  language plpgsql as $$
  declare v_rows int;
  begin
    delete from public.group_members
     where group_id = torny_rls.group_id() and user_id = p_target;
    get diagnostics v_rows = row_count;
    return case when v_rows > 0 then 'ok' else 'no_rows' end;
  exception when others then return sqlstate;
  end;
$$;

-- p_table and p_set are trusted literals written in this file.
create or replace function torny_rls.try_update(p_table text, p_id uuid, p_set text) returns text
  language plpgsql as $$
  declare v_rows int;
  begin
    execute format('update public.%I set %s where id = %L', p_table, p_set, p_id);
    get diagnostics v_rows = row_count;
    return case when v_rows > 0 then 'ok' else 'no_rows' end;
  exception when others then return sqlstate;
  end;
$$;

create or replace function torny_rls.try_update_group(p_set text) returns text
  language sql as $$ select torny_rls.try_update('groups', torny_rls.group_id(), p_set) $$;

create or replace function torny_rls.try_delete_group(p_group uuid) returns text
  language plpgsql as $$
  declare v_rows int;
  begin
    delete from public.groups where id = p_group;
    get diagnostics v_rows = row_count;
    return case when v_rows > 0 then 'ok' else 'no_rows' end;
  exception when others then return sqlstate;
  end;
$$;

create or replace function torny_rls.try_insert_group(p_created_by uuid) returns text
  language plpgsql as $$
  begin
    insert into public.groups (name, created_by) values ('Self-made club 0248', p_created_by);
    return 'ok';
  exception when others then return sqlstate;
  end;
$$;

create or replace function torny_rls.try_set_role(p_target uuid, p_role public.group_role) returns text
  language plpgsql as $$
  begin
    perform public.set_club_member_role(torny_rls.group_id(), p_target, p_role);
    return 'ok';
  exception when others then return sqlerrm;
  end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- A. Owner role and membership rows
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.active_id());   -- club admin, not owner

select is(torny_rls.try_insert_member(torny_rls.outsider_id(), 'owner'), '42501',
  'club admin is BLOCKED from inserting an owner row');
select is(torny_rls.try_insert_member(torny_rls.outsider_id(), 'member'), '42501',
  'club admin is BLOCKED from inserting a member row directly (the RPCs hold the cap and the end date)');
select is(torny_rls.try_set_role(torny_rls.active_id(), 'owner'), 'not_authorized',
  'club admin is BLOCKED from giving the owner role through the RPC');
select is(torny_rls.try_delete_member(torny_rls.submitted_id()), 'no_rows',
  'club admin is BLOCKED from removing an owner while another owner remains');

select torny_rls.as_service();
select is(
  (select count(*)::int from public.group_members
    where group_id = torny_rls.group_id() and role = 'owner'),
  2, 'both owner rows are still there, and no new owner appeared');

select torny_rls.as_user(torny_rls.active_id());
select is(torny_rls.try_delete_member(torny_rls.withdrawn_id()), 'ok',
  'club admin CAN still remove a plain member');

select torny_rls.as_user(torny_rls.withdrawn_id()); -- removed above: now an outsider
select is(torny_rls.try_insert_member(torny_rls.withdrawn_id(), 'member'), '42501',
  'a non-member is BLOCKED from inserting their own membership');

select torny_rls.as_user(torny_rls.flightmate_id()); -- owner
select is(torny_rls.try_insert_member(torny_rls.outsider_id(), 'owner'), '42501',
  'an owner is BLOCKED from a direct insert too: roles go through set_club_member_role');
select is(torny_rls.try_set_role(torny_rls.active_id(), 'owner'), 'ok',
  'an owner CAN give the owner role through the RPC');
select is(torny_rls.try_set_role(torny_rls.active_id(), 'admin'), 'ok',
  'an owner CAN take the owner role back through the RPC');
select is(torny_rls.try_delete_member(torny_rls.submitted_id()), 'ok',
  'an owner CAN remove another owner');

-- The RPC paths still add members after the direct insert policy is gone.
select torny_rls.as_user(torny_rls.active_id());
select is(
  public.decide_join_request(
    (select id from public.group_join_requests
      where group_id = torny_rls.group_id() and user_id = torny_rls.outsider_id()),
    true),
  'approved', 'club admin CAN approve a join request through the RPC');

select torny_rls.as_service();
select is(
  (select role::text from public.group_members
    where group_id = torny_rls.group_id() and user_id = torny_rls.outsider_id()),
  'member', 'the approved requester is a member');

select torny_rls.as_user(torny_rls.admin_id());     -- global admin
select is(torny_rls.try_delete_member(torny_rls.outsider_id()), 'ok',
  'global admin CAN remove a member');

-- ═════════════════════════════════════════════════════════════════════════════
-- B. Agreement terms and identity columns
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.active_id());   -- club admin

select is(torny_rls.try_update_group('member_cap = 999'), '42501',
  'club admin is BLOCKED from changing member_cap');
select is(torny_rls.try_update_group('member_cap = null'), '42501',
  'club admin is BLOCKED from clearing member_cap');
select is(torny_rls.try_update_group($$valid_until = now() + interval '10 years'$$), '42501',
  'club admin is BLOCKED from changing valid_until');
select is(torny_rls.try_update_group($$short_id = 'abcd2480'$$), '42501',
  'club admin is BLOCKED from changing short_id');
select is(torny_rls.try_update_group(format('created_by = %L', torny_rls.active_id())), '42501',
  'club admin is BLOCKED from changing created_by');
select is(torny_rls.try_update_group($$name = 'Renamed club 0248'$$), 'ok',
  'club admin CAN still change the club name');

select torny_rls.as_user(torny_rls.flightmate_id()); -- owner
select is(torny_rls.try_update_group('member_cap = 500'), '42501',
  'an owner is BLOCKED from changing member_cap');
select is(torny_rls.try_update_group($$valid_until = now() + interval '10 years'$$), '42501',
  'an owner is BLOCKED from changing valid_until');

select torny_rls.as_user(torny_rls.outsider_id());
select is(torny_rls.try_insert_group(torny_rls.outsider_id()), '42501',
  'a signed-in user is BLOCKED from inserting a club row directly');

select torny_rls.as_user(torny_rls.admin_id());     -- global admin
select is(torny_rls.try_update_group($$member_cap = 50, valid_until = now() + interval '1 year'$$), 'ok',
  'global admin CAN set member_cap and valid_until');

select torny_rls.as_service();
select is(torny_rls.try_update_group('member_cap = 4, valid_until = null'), 'ok',
  'service role CAN set member_cap and valid_until (the admin page writes this way)');
select is(
  (select member_cap from public.groups where id = torny_rls.group_id()),
  4, 'member_cap holds the value the service role wrote, not a club-side value');

-- ═════════════════════════════════════════════════════════════════════════════
-- C. A club with a league or a cup stays
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.active_id());   -- club admin
select is(torny_rls.try_delete_group(torny_rls.group_id()), 'no_rows',
  'club admin is BLOCKED from deleting the club');

select torny_rls.as_user(torny_rls.admin_id());     -- global admin
select is(torny_rls.try_delete_group(torny_rls.group_id()), '23503',
  'global admin is BLOCKED from deleting a club that has a league and a cup');

select torny_rls.as_service();
select is(torny_rls.try_delete_group(torny_rls.group_id()), '23503',
  'service role is BLOCKED from deleting a club that has a league and a cup');

select torny_rls.as_user(torny_rls.outsider_id());
select is(
  (select count(*)::int from public.leagues where id = '00000000-0000-4000-a000-0000000248a1')
  + (select count(*)::int from public.tournaments where id = '00000000-0000-4000-a000-0000000248b1'),
  0, 'the club league and the club cup stay hidden from a signed-in non-member');

select torny_rls.as_user(torny_rls.admin_id());
select is(torny_rls.try_delete_group('00000000-0000-4000-a000-0000000248e2'), 'ok',
  'global admin CAN delete a club without leagues or cups');

-- ═════════════════════════════════════════════════════════════════════════════
-- D. A league or a cup keeps its club
-- ═════════════════════════════════════════════════════════════════════════════
-- active_id is club admin of the test club and of a second club, and created
-- one cup and one league in the test club.
select torny_rls.as_service();
insert into public.groups (id, name, created_by)
  values ('00000000-0000-4000-a000-0000000248e3', 'Second club 0248', torny_rls.admin_id());
insert into public.group_members (group_id, user_id, role) values
  ('00000000-0000-4000-a000-0000000248e3', torny_rls.flightmate_id(), 'owner'),
  ('00000000-0000-4000-a000-0000000248e3', torny_rls.active_id(),     'admin');
insert into public.tournaments (id, name, team_1_name, team_2_name, created_by, group_id)
  values ('00000000-0000-4000-a000-0000000248b2', 'Own club cup 0248', 'A', 'B',
          torny_rls.active_id(), torny_rls.group_id());
insert into public.leagues (id, name, season_start, season_end, standings_model, course_scope, created_by, group_id)
  values ('00000000-0000-4000-a000-0000000248a2', 'Own club league 0248', '2026-01-01', '2026-12-31',
          'total', 'multi_course', torny_rls.active_id(), torny_rls.group_id());
insert into public.tournaments (id, name, team_1_name, team_2_name, created_by, group_id)
  values ('00000000-0000-4000-a000-0000000248b3', 'Standalone cup 0248', 'A', 'B',
          torny_rls.active_id(), null);

select torny_rls.as_user(torny_rls.active_id());
select is(torny_rls.try_update('tournaments', '00000000-0000-4000-a000-0000000248b2', 'group_id = null'), '42501',
  'the creator of a club cup is BLOCKED from taking it out of the club');
select is(torny_rls.try_update('tournaments', '00000000-0000-4000-a000-0000000248b2',
    $$group_id = '00000000-0000-4000-a000-0000000248e3'$$), '42501',
  'an admin of two clubs is BLOCKED from moving a cup between them');
select is(torny_rls.try_update('leagues', '00000000-0000-4000-a000-0000000248a2', 'group_id = null'), '42501',
  'the creator of a club league is BLOCKED from taking it out of the club');
select is(torny_rls.try_update('leagues', '00000000-0000-4000-a000-0000000248a2',
    $$group_id = '00000000-0000-4000-a000-0000000248e3'$$), '42501',
  'an admin of two clubs is BLOCKED from moving a league between them');
select is(torny_rls.try_update('tournaments', '00000000-0000-4000-a000-0000000248b2', $$name = 'Renamed cup 0248'$$), 'ok',
  'club admin CAN still edit the other fields of a club cup');
select is(torny_rls.try_update('leagues', '00000000-0000-4000-a000-0000000248a2', $$name = 'Renamed league 0248'$$), 'ok',
  'club admin CAN still edit the other fields of a club league');
select is(torny_rls.try_update('tournaments', '00000000-0000-4000-a000-0000000248b3', $$name = 'Renamed standalone 0248'$$), 'ok',
  'the creator CAN still edit a standalone cup');

select torny_rls.as_user(torny_rls.outsider_id());
select is(
  (select count(*)::int from public.tournaments where id = '00000000-0000-4000-a000-0000000248b2')
  + (select count(*)::int from public.leagues where id = '00000000-0000-4000-a000-0000000248a2'),
  0, 'the club cup and the club league are still hidden from a signed-in non-member');

select torny_rls.as_user(torny_rls.admin_id());     -- global admin
select is(torny_rls.try_update('tournaments', '00000000-0000-4000-a000-0000000248b2',
    $$group_id = '00000000-0000-4000-a000-0000000248e3'$$), 'ok',
  'global admin CAN move a cup to another club');

select torny_rls.as_service();
select is(torny_rls.try_update('leagues', '00000000-0000-4000-a000-0000000248a2',
    $$group_id = '00000000-0000-4000-a000-0000000248e3'$$), 'ok',
  'service role CAN move a league to another club');

select * from finish();
rollback;
