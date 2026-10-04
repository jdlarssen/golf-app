-- supabase/tests/games_draft_hidden_rls_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- RLS integration test: a draft is hidden from its players until it is
-- published (#2445, migration 0202).
--
-- Seed: draft D, organised by flightmate_id (non-admin), invite_only. On its
-- list: flightmate_id, active_id and outsider_id, none accepted. outsider_id is
-- not in the rig's active game, so active_id can only see outsider_id's profile
-- through D. submitted_id is a stranger to D.
--
--   While D is a draft:
--     player (active_id): D, its list and outsider_id's profile are invisible,
--       is_in_game(D) is false, the active game is still visible (control).
--       Hostile writes: accepting or deleting the own row on D hits 0 rows,
--       and the row survives untouched.
--       Invite trigger (0115 + 0202): active_id cannot add outsider_id to own
--       game E, because D alone does not make them co-players.
--     organiser (flightmate_id) and global admin: D and its whole list (3).
--     stranger (submitted_id): nothing.
--   After publishing D (status = 'scheduled'):
--     player: D, its list, is_in_game(D), outsider_id's profile; the accept
--       PATCH now hits 1 row; the E insert now goes through.
--     stranger: still nothing.
--
-- Every probe and its check are SEPARATE statements: a check in the same
-- statement as the write reads the pre-write snapshot (#1910).
--
-- Run via:  supabase test db   (see supabase/tests/README.md)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(21);

\ir fixtures/rls_helpers.psql

-- ── Scenario-local fixtures (dh_ = draft hidden) ─────────────────────────────
create or replace function torny_rls.dh_draft() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-244500000001'::uuid $$;
create or replace function torny_rls.dh_own()   returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-244500000002'::uuid $$;

-- dh_try_accept / dh_try_delete: the current impersonated user writes its own
-- row on p_game. Returns the affected row count (RLS denial = 0 rows).
create or replace function torny_rls.dh_try_accept(p_game uuid, p_user uuid) returns int
  language plpgsql as $$
  declare v_rows int;
  begin
    update public.game_players set accepted_at = now()
     where game_id = p_game and user_id = p_user;
    get diagnostics v_rows = row_count;
    return v_rows;
  exception when insufficient_privilege then return 0;
  end;
$$;

create or replace function torny_rls.dh_try_delete(p_game uuid, p_user uuid) returns int
  language plpgsql as $$
  declare v_rows int;
  begin
    delete from public.game_players where game_id = p_game and user_id = p_user;
    get diagnostics v_rows = row_count;
    return v_rows;
  exception when insufficient_privilege then return 0;
  end;
$$;

-- security definer: reads past RLS, so a row the caller cannot see is not
-- mistaken for a deleted one. 'missing' | 'pending' | 'accepted'.
create or replace function torny_rls.dh_row_state(p_game uuid, p_user uuid) returns text
  language sql security definer set search_path = '' as $$
    select coalesce(
      (select case when gp.accepted_at is null then 'pending' else 'accepted' end
         from public.game_players gp
        where gp.game_id = p_game and gp.user_id = p_user),
      'missing');
$$;

grant execute on all functions in schema torny_rls to authenticated, anon, service_role;

-- ── Seed ──────────────────────────────────────────────────────────────────────
select torny_rls.as_service();
select torny_rls.seed_active_game();

insert into public.games (id, name, course_id, tee_box_id, status, game_mode, created_by, registration_mode) values
  (torny_rls.dh_draft(), 'DH Draft',   torny_rls.course_id(), torny_rls.tee_box_id(), 'draft',     'solo_strokeplay', torny_rls.flightmate_id(), 'invite_only'),
  (torny_rls.dh_own(),   'DH Own game', torny_rls.course_id(), torny_rls.tee_box_id(), 'scheduled', 'solo_strokeplay', torny_rls.active_id(),     'invite_only');

insert into public.game_players (game_id, user_id, accepted_at) values
  (torny_rls.dh_draft(), torny_rls.flightmate_id(), null),
  (torny_rls.dh_draft(), torny_rls.active_id(),     null),
  (torny_rls.dh_draft(), torny_rls.outsider_id(),   null);

-- ═════════════════════════════════════════════════════════════════════════════
-- D is a draft
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.active_id());

select is((select count(*)::int from public.games where id = torny_rls.dh_draft()), 0,
  '#2445: a player on the list does NOT see the draft');
select is((select count(*)::int from public.game_players where game_id = torny_rls.dh_draft()), 0,
  '#2445: a player on the list does NOT see the draft''s list');
select ok(not public.is_in_game(torny_rls.dh_draft()),
  '#2445: is_in_game is false for a draft');
select is((select count(*)::int from public.users where id = torny_rls.outsider_id()), 0,
  '#2445: a co-player seen only through the draft has no visible profile');
select is((select count(*)::int from public.games where id = torny_rls.game_id()), 1,
  'control: the player still sees the published game they are in');

-- Hostile writes on the hidden row.
select is(torny_rls.dh_try_accept(torny_rls.dh_draft(), torny_rls.active_id()), 0,
  '#2445: accepting the own row on a draft hits 0 rows (direct PATCH)');
select is(torny_rls.dh_try_delete(torny_rls.dh_draft(), torny_rls.active_id()), 0,
  '#2445: deleting the own row on a draft hits 0 rows (direct DELETE)');
select is(torny_rls.dh_row_state(torny_rls.dh_draft(), torny_rls.active_id()), 'pending',
  '#2445: the player''s row on the draft survives, still not accepted');

-- Invite trigger: D alone does not make outsider_id a co-player of active_id.
select throws_like(
  $$insert into public.game_players (game_id, user_id) values (torny_rls.dh_own(), torny_rls.outsider_id())$$,
  '%not invite-eligible%',
  '#2445: a draft someone else organises makes no co-players (invite trigger)'
);

select torny_rls.as_user(torny_rls.flightmate_id());

select is((select count(*)::int from public.games where id = torny_rls.dh_draft()), 1,
  'the organiser sees the own draft');
select is((select count(*)::int from public.game_players where game_id = torny_rls.dh_draft()), 3,
  'the organiser sees the draft''s whole list (game_players creator select)');

select torny_rls.as_user(torny_rls.admin_id());

select is((select count(*)::int from public.games where id = torny_rls.dh_draft()), 1,
  'a global admin sees the draft');
select is((select count(*)::int from public.game_players where game_id = torny_rls.dh_draft()), 3,
  'a global admin sees the draft''s whole list');

select torny_rls.as_user(torny_rls.submitted_id());

select is((select count(*)::int from public.games where id = torny_rls.dh_draft()), 0,
  'a stranger does not see the draft');

-- ═════════════════════════════════════════════════════════════════════════════
-- D is published
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_service();
update public.games set status = 'scheduled' where id = torny_rls.dh_draft();

select torny_rls.as_user(torny_rls.active_id());

select is((select count(*)::int from public.games where id = torny_rls.dh_draft()), 1,
  'published: the player sees the game');
select is((select count(*)::int from public.game_players where game_id = torny_rls.dh_draft()), 3,
  'published: the player sees the whole list');
select ok(public.is_in_game(torny_rls.dh_draft()),
  'published: is_in_game is true');
select is((select count(*)::int from public.users where id = torny_rls.outsider_id()), 1,
  'published: the co-player''s profile is visible');
select is(torny_rls.dh_try_accept(torny_rls.dh_draft(), torny_rls.active_id()), 1,
  'published: the same accept PATCH hits 1 row');
select lives_ok(
  $$insert into public.game_players (game_id, user_id) values (torny_rls.dh_own(), torny_rls.outsider_id())$$,
  'published: the game makes them co-players, so the invite goes through'
);

select torny_rls.as_user(torny_rls.submitted_id());

select is((select count(*)::int from public.games where id = torny_rls.dh_draft()), 0,
  'published: a stranger still does not see the game');

select * from finish();
rollback;
