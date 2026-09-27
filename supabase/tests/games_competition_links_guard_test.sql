-- supabase/tests/games_competition_links_guard_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Competition links on games (#2207, migration 0185).
--
-- The "games creator insert/update" policies check only created_by. The
-- guard_games_competition_links trigger adds: tournament_id and source_game_id
-- can only be set by someone who manages the cup (can_manage_tournament), and
-- group_id only by a member of the club. Changing a link to NULL is never
-- checked (ON DELETE SET NULL, an organiser unlinking their own game).
--
--   PARITY (1–10): can_manage_tournament agrees with the UPDATE policy on
--   tournaments, for a club cup and a personal cup, per actor: global admin,
--   club admin, personal-cup creator, club member, stranger.
--   tournament_id (11–17): stranger insert → 42501, stranger PATCH → 42501,
--   organiser insert → ok, organiser to NULL → ok, organiser deletes the cup
--   → ok and the game's link is cleared.
--   source_game_id (18–20): stranger → 42501, organiser's derived match in
--   the same cup → ok, a source in another cup → 42501.
--   group_id (21–22): non-member → 42501, member → ok.
--
-- Every probe and its check are separate statements (#1910).
-- Depends on 0185 only. Run via: supabase test db (see supabase/tests/README.md)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(22);

\ir fixtures/rls_helpers.psql

-- ── Scenario-local fixtures (lc_ = links, cup) ────────────────────────────────
create or replace function torny_rls.lc_club()      returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-220700000001'::uuid $$;
create or replace function torny_rls.lc_club_cup()  returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-220700000002'::uuid $$;
create or replace function torny_rls.lc_cup_a()     returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-220700000003'::uuid $$;
create or replace function torny_rls.lc_cup_b()     returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-220700000004'::uuid $$;
create or replace function torny_rls.lc_cup_c()     returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-220700000005'::uuid $$;
create or replace function torny_rls.lc_host_a()    returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-220700000011'::uuid $$;
create or replace function torny_rls.lc_host_b()    returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-220700000012'::uuid $$;
create or replace function torny_rls.lc_in_cup_a()  returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-220700000013'::uuid $$;
create or replace function torny_rls.lc_in_cup_c()  returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-220700000014'::uuid $$;
create or replace function torny_rls.lc_stranger_game() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-220700000015'::uuid $$;

-- lc_try_update_tournament(t): the current impersonated user touches the cup
-- row. True when the UPDATE policy let it through.
create or replace function torny_rls.lc_try_update_tournament(p_tournament uuid) returns boolean
  language plpgsql as $$
  declare v_rows int;
  begin
    update public.tournaments set name = name where id = p_tournament;
    get diagnostics v_rows = row_count;
    return v_rows > 0;
  exception when insufficient_privilege then return false;
  end;
$$;

-- security definer: reads past RLS, so a stranger's own view never decides it.
create or replace function torny_rls.lc_tournament_of(p_game uuid) returns uuid
  language sql security definer set search_path = '' as $$
    select tournament_id from public.games where id = p_game;
$$;

grant execute on all functions in schema torny_rls to authenticated, anon, service_role;

-- ── Seed ──────────────────────────────────────────────────────────────────────
-- Cast from the shared rig: admin_id (global admin), flightmate_id (club owner),
-- active_id (creator of the personal cups), withdrawn_id (club member),
-- outsider_id (stranger).
select torny_rls.as_service();
select torny_rls.seed_active_game();

insert into public.groups (id, name, created_by) values (torny_rls.lc_club(), 'LC Club', torny_rls.flightmate_id());
insert into public.group_members (group_id, user_id, role) values
  (torny_rls.lc_club(), torny_rls.flightmate_id(), 'owner'),
  (torny_rls.lc_club(), torny_rls.withdrawn_id(),  'member');

insert into public.tournaments (id, name, team_1_name, team_2_name, status, created_by, group_id) values
  (torny_rls.lc_club_cup(), 'LC Club Cup', 'Europa', 'USA', 'active', torny_rls.flightmate_id(), torny_rls.lc_club()),
  (torny_rls.lc_cup_a(),    'LC Cup A',    'Europa', 'USA', 'active', torny_rls.active_id(),     null),
  (torny_rls.lc_cup_b(),    'LC Cup B',    'Europa', 'USA', 'active', torny_rls.active_id(),     null),
  (torny_rls.lc_cup_c(),    'LC Cup C',    'Europa', 'USA', 'active', torny_rls.active_id(),     null);

insert into public.games (id, name, course_id, tee_box_id, status, game_mode, created_by, tournament_id) values
  (torny_rls.lc_host_a(),        'LC host A',     torny_rls.course_id(), torny_rls.tee_box_id(), 'draft', 'solo_strokeplay', torny_rls.active_id(),   torny_rls.lc_cup_a()),
  (torny_rls.lc_host_b(),        'LC host B',     torny_rls.course_id(), torny_rls.tee_box_id(), 'draft', 'solo_strokeplay', torny_rls.active_id(),   torny_rls.lc_cup_b()),
  (torny_rls.lc_in_cup_a(),      'LC in cup A',   torny_rls.course_id(), torny_rls.tee_box_id(), 'draft', 'solo_strokeplay', torny_rls.active_id(),   torny_rls.lc_cup_a()),
  (torny_rls.lc_in_cup_c(),      'LC in cup C',   torny_rls.course_id(), torny_rls.tee_box_id(), 'draft', 'solo_strokeplay', torny_rls.outsider_id(), torny_rls.lc_cup_c()),
  (torny_rls.lc_stranger_game(), 'LC stranger',   torny_rls.course_id(), torny_rls.tee_box_id(), 'draft', 'solo_strokeplay', torny_rls.outsider_id(), null);

-- ═════════════════════════════════════════════════════════════════════════════
-- PARITY — can_manage_tournament ↔ UPDATE on tournaments (club cup, cup A)
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.admin_id());
select is(array[public.can_manage_tournament(torny_rls.lc_club_cup()), public.can_manage_tournament(torny_rls.lc_cup_a())],
  array[true, true], 'global admin: can_manage_tournament = {club cup, personal cup}');
select is(array[torny_rls.lc_try_update_tournament(torny_rls.lc_club_cup()), torny_rls.lc_try_update_tournament(torny_rls.lc_cup_a())],
  array[true, true], 'global admin: the UPDATE policy agrees');

select torny_rls.as_user(torny_rls.flightmate_id());
select is(array[public.can_manage_tournament(torny_rls.lc_club_cup()), public.can_manage_tournament(torny_rls.lc_cup_a())],
  array[true, false], 'club admin: can_manage_tournament = {club cup only}');
select is(array[torny_rls.lc_try_update_tournament(torny_rls.lc_club_cup()), torny_rls.lc_try_update_tournament(torny_rls.lc_cup_a())],
  array[true, false], 'club admin: the UPDATE policy agrees');

select torny_rls.as_user(torny_rls.active_id());
select is(array[public.can_manage_tournament(torny_rls.lc_club_cup()), public.can_manage_tournament(torny_rls.lc_cup_a())],
  array[false, true], 'personal-cup creator: can_manage_tournament = {own personal cup only}');
select is(array[torny_rls.lc_try_update_tournament(torny_rls.lc_club_cup()), torny_rls.lc_try_update_tournament(torny_rls.lc_cup_a())],
  array[false, true], 'personal-cup creator: the UPDATE policy agrees');

select torny_rls.as_user(torny_rls.withdrawn_id());
select is(array[public.can_manage_tournament(torny_rls.lc_club_cup()), public.can_manage_tournament(torny_rls.lc_cup_a())],
  array[false, false], 'club member: can_manage_tournament = {}');
select is(array[torny_rls.lc_try_update_tournament(torny_rls.lc_club_cup()), torny_rls.lc_try_update_tournament(torny_rls.lc_cup_a())],
  array[false, false], 'club member: the UPDATE policy agrees');

select torny_rls.as_user(torny_rls.outsider_id());
select is(array[public.can_manage_tournament(torny_rls.lc_club_cup()), public.can_manage_tournament(torny_rls.lc_cup_a())],
  array[false, false], 'stranger: can_manage_tournament = {}');
select is(array[torny_rls.lc_try_update_tournament(torny_rls.lc_club_cup()), torny_rls.lc_try_update_tournament(torny_rls.lc_cup_a())],
  array[false, false], 'stranger: the UPDATE policy agrees');

-- ═════════════════════════════════════════════════════════════════════════════
-- tournament_id
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.outsider_id());

select throws_ok(
  $$ insert into public.games (name, course_id, tee_box_id, status, game_mode, created_by, tournament_id)
     values ('LC stranger in cup', torny_rls.course_id(), torny_rls.tee_box_id(), 'draft', 'solo_strokeplay', torny_rls.outsider_id(), torny_rls.lc_cup_a()) $$,
  '42501', null,
  'stranger CANNOT insert a game linked to someone else''s cup');

select throws_ok(
  $$ update public.games set tournament_id = torny_rls.lc_cup_a() where id = torny_rls.lc_stranger_game() $$,
  '42501', null,
  'stranger CANNOT link their own game to someone else''s cup (direct PATCH)');

select torny_rls.as_user(torny_rls.active_id());

select lives_ok(
  $$ insert into public.games (name, course_id, tee_box_id, status, game_mode, created_by, tournament_id)
     values ('LC organiser match', torny_rls.course_id(), torny_rls.tee_box_id(), 'draft', 'solo_strokeplay', torny_rls.active_id(), torny_rls.lc_cup_a()) $$,
  'cup organiser CAN insert a match in their own cup');

select lives_ok(
  $$ update public.games set tournament_id = null where id = torny_rls.lc_in_cup_a() $$,
  'cup organiser CAN unlink their own game from the cup (to NULL is never checked)');
select is(torny_rls.lc_tournament_of(torny_rls.lc_in_cup_a()), null::uuid,
  'the unlinked game has no tournament_id');

-- lc_in_cup_c belongs to the stranger; deleting the cup clears its link via
-- ON DELETE SET NULL, which the trigger must let through.
select lives_ok(
  $$ delete from public.tournaments where id = torny_rls.lc_cup_c() $$,
  'cup organiser CAN delete their cup (SET NULL cascade on games passes the trigger)');
select is(torny_rls.lc_tournament_of(torny_rls.lc_in_cup_c()), null::uuid,
  'the cascade cleared tournament_id on the stranger''s game');

-- ═════════════════════════════════════════════════════════════════════════════
-- source_game_id
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.outsider_id());

select throws_ok(
  $$ insert into public.games (name, course_id, tee_box_id, status, game_mode, created_by, source_game_id)
     values ('LC stranger derived', torny_rls.course_id(), torny_rls.tee_box_id(), 'draft', 'solo_strokeplay', torny_rls.outsider_id(), torny_rls.lc_host_a()) $$,
  '42501', null,
  'stranger CANNOT derive a game from a cup match');

select torny_rls.as_user(torny_rls.active_id());

select lives_ok(
  $$ insert into public.games (name, course_id, tee_box_id, status, game_mode, created_by, tournament_id, source_game_id)
     values ('LC derived A', torny_rls.course_id(), torny_rls.tee_box_id(), 'draft', 'solo_strokeplay', torny_rls.active_id(), torny_rls.lc_cup_a(), torny_rls.lc_host_a()) $$,
  'cup organiser CAN insert a derived match from a host in the same cup');

select throws_ok(
  $$ insert into public.games (name, course_id, tee_box_id, status, game_mode, created_by, tournament_id, source_game_id)
     values ('LC derived cross', torny_rls.course_id(), torny_rls.tee_box_id(), 'draft', 'solo_strokeplay', torny_rls.active_id(), torny_rls.lc_cup_a(), torny_rls.lc_host_b()) $$,
  '42501', null,
  'a derived match CANNOT point to a host in another cup, even one the organiser runs');

-- ═════════════════════════════════════════════════════════════════════════════
-- group_id (#442)
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.outsider_id());

select throws_ok(
  $$ insert into public.games (name, course_id, tee_box_id, status, game_mode, created_by, group_id)
     values ('LC stranger club game', torny_rls.course_id(), torny_rls.tee_box_id(), 'draft', 'solo_strokeplay', torny_rls.outsider_id(), torny_rls.lc_club()) $$,
  '42501', null,
  'non-member CANNOT put a game under a club');

select torny_rls.as_user(torny_rls.withdrawn_id());

select lives_ok(
  $$ insert into public.games (name, course_id, tee_box_id, status, game_mode, created_by, group_id)
     values ('LC member club game', torny_rls.course_id(), torny_rls.tee_box_id(), 'draft', 'solo_strokeplay', torny_rls.withdrawn_id(), torny_rls.lc_club()) $$,
  'club member CAN put a game under the club');

select * from finish();
rollback;
