-- supabase/tests/transfer_team_captaincy_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Runtime test for migration 0194 (#2358): transfer_team_captaincy.
--
--   1. The team's captain, the game's creator and a global admin may hand the
--      captaincy to an approved teammate on the roster. The new captain takes
--      the team name; the old captain and every other child point at the new
--      one; team numbers are untouched. The old captain's roster place is
--      marked confirmed: they registered the team, so as a member they have
--      said yes (otherwise an organiser-approved team would read them as an
--      unanswered invitation, and the new captain could withdraw them).
--   2. Everyone else is refused and nothing is written: a third party gets
--      not_allowed, another team's captain gets not_a_teammate, a pending or
--      off-roster teammate gives not_approved, a started game gives
--      game_locked, an unknown game gives game_not_found.
--   3. Only service_role may call it.
--
-- Every transfer is called in its own statement and its effect is read in the
-- NEXT statement: a statement does not see its own writes (#1910).
--
-- Fixtures live in their own `torny_ttc` schema so they cannot collide with the
-- other suites. Inlined helpers so the file also runs as a rolled-back probe on
-- staging (no `\ir` there).
--
-- Run via: supabase test db   (or `npm run test:rls`)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(30);

-- ── Fixture ids ──────────────────────────────────────────────────────────────
create schema if not exists torny_ttc;

-- uid(n): fixture user n. uid(0) creates every game, uid(99) is a global admin,
-- uid(98) is a signed-in player with no part in any team.
create or replace function torny_ttc.uid(n int) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-b358-1' || lpad(n::text, 11, '0'))::uuid
$$;
create or replace function torny_ttc.gid(n int) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-b358-2' || lpad(n::text, 11, '0'))::uuid
$$;
-- rid(n): the registration request of uid(n).
create or replace function torny_ttc.rid(n int) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-b358-3' || lpad(n::text, 11, '0'))::uuid
$$;

create or replace function torny_ttc.seed_game(p_n int, p_status text) returns void
  language plpgsql as $$
  begin
    insert into public.games (id, name, game_mode, mode_config, status, registration_mode, created_by)
    values (torny_ttc.gid(p_n), 'TTC game ' || p_n, 'texas_scramble',
            jsonb_build_object('team_size', 4), p_status::public.game_status, 'open',
            torny_ttc.uid(0));
  end;
$$;

-- request(game, user, status, captain_of): captain_of null = the team's captain
-- (named 'Lag ' || user), otherwise a child of rid(captain_of).
create or replace function torny_ttc.request(
  p_game int, p_user int, p_status text, p_captain_of int
) returns void language plpgsql as $$
  begin
    insert into public.game_registration_requests
      (id, game_id, user_id, status, team_name, is_team_captain, team_request_id)
    values (torny_ttc.rid(p_user), torny_ttc.gid(p_game), torny_ttc.uid(p_user),
            p_status::public.registration_request_status,
            case when p_captain_of is null then 'Lag ' || p_user
                 else 'Lag ' || p_captain_of end,
            p_captain_of is null,
            case when p_captain_of is null then null else torny_ttc.rid(p_captain_of) end);
  end;
$$;

create or replace function torny_ttc.roster(p_game int, p_user int, p_team int) returns void
  language sql as $$
  insert into public.game_players (game_id, user_id, team_number, flight_number)
  values (torny_ttc.gid(p_game), torny_ttc.uid(p_user), p_team, p_team)
$$;

-- transfer: calls the function under test as the service role. Before 0194 the
-- function does not exist; answering instead of raising keeps the red run a
-- list of failing asserts rather than one aborted transaction.
create or replace function torny_ttc.transfer(p_game int, p_actor int, p_new int)
  returns text language plpgsql as $$
  begin
    return public.transfer_team_captaincy(
      p_game_id => torny_ttc.gid(p_game),
      p_actor_user_id => torny_ttc.uid(p_actor),
      p_new_captain_request_id => torny_ttc.rid(p_new)) ->> 'outcome';
  exception
    when undefined_function then
      return 'function_missing';
  end;
$$;

-- shape(user): is_team_captain | team_request_id's owner | team_name, one text
-- per request, so each assert reads one line.
create or replace function torny_ttc.shape(p_user int) returns text language sql stable as $$
  select r.is_team_captain::text || '|' ||
         coalesce((select substr(p.user_id::text, 26)::int::text
                     from public.game_registration_requests p
                    where p.id = r.team_request_id), '-') || '|' ||
         coalesce(r.team_name, '-')
    from public.game_registration_requests r
   where r.id = torny_ttc.rid(p_user)
$$;

-- accepted(game, user): 'yes' when the roster place is confirmed, 'no' when
-- not, '-' when there is no roster row.
create or replace function torny_ttc.accepted(p_game int, p_user int) returns text language sql stable as $$
  select coalesce((select case when accepted_at is null then 'no' else 'yes' end
                     from public.game_players
                    where game_id = torny_ttc.gid(p_game) and user_id = torny_ttc.uid(p_user)), '-')
$$;

create or replace function torny_ttc.team_numbers(p_game int) returns text language sql stable as $$
  select string_agg(substr(user_id::text, 26)::int::text || ':' || team_number, ',' order by user_id)
    from public.game_players where game_id = torny_ttc.gid(p_game)
$$;

-- ── Seed ─────────────────────────────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email)
select torny_ttc.uid(n), '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated',
       'authenticated', 'ttc-' || n || '@example.test'
  from (select generate_series(0, 30) as n union all select 98 union all select 99) as u;

insert into public.users (id, email, name, is_admin)
select id, email, 'TTC ' || email, id = torny_ttc.uid(99) from auth.users
 where email like 'ttc-%@example.test'
on conflict (id) do update set email = excluded.email, name = excluded.name, is_admin = excluded.is_admin;

-- Game 1 (draft). Team 1: captain 1, approved 2 and 3 on the roster, pending 4
-- (no roster row), approved 7 without a roster row. Team 2: captain 5, approved 6.
select torny_ttc.seed_game(1, 'draft');
select torny_ttc.request(1, 1, 'approved', null);
select torny_ttc.request(1, 2, 'approved', 1);
select torny_ttc.request(1, 3, 'approved', 1);
select torny_ttc.request(1, 4, 'pending', 1);
select torny_ttc.request(1, 7, 'approved', 1);
select torny_ttc.request(1, 5, 'approved', null);
select torny_ttc.request(1, 6, 'approved', 5);
select torny_ttc.roster(1, 1, 1);
select torny_ttc.roster(1, 2, 1);
select torny_ttc.roster(1, 3, 1);
select torny_ttc.roster(1, 5, 2);
select torny_ttc.roster(1, 6, 2);

-- Game 2 (active): captain 11, approved 12 on the roster.
select torny_ttc.seed_game(2, 'active');
select torny_ttc.request(2, 11, 'approved', null);
select torny_ttc.request(2, 12, 'approved', 11);
select torny_ttc.roster(2, 11, 1);
select torny_ttc.roster(2, 12, 1);

-- ── 1. Refusals write nothing ────────────────────────────────────────────────
select is(torny_ttc.transfer(1, 98, 2), 'not_allowed', 'a third party → not_allowed');
select is(torny_ttc.shape(1), 'true|-|Lag 1', 'third party: the captain is unchanged');
select is(torny_ttc.shape(2), 'false|1|Lag 1', 'third party: the teammate is unchanged');

select is(torny_ttc.transfer(1, 1, 6), 'not_a_teammate', 'a player on another team → not_a_teammate');
select is(torny_ttc.shape(6), 'false|5|Lag 5', 'another team: that team is unchanged');

select is(torny_ttc.transfer(1, 1, 4), 'not_approved', 'a pending teammate → not_approved');
select is(torny_ttc.transfer(1, 1, 7), 'not_approved', 'an approved teammate off the roster → not_approved');
select is(torny_ttc.transfer(1, 1, 1), 'not_a_teammate', 'the captain themself → not_a_teammate');
select is(torny_ttc.shape(1), 'true|-|Lag 1', 'refusals: the captain is still captain');

select is(torny_ttc.transfer(2, 11, 12), 'game_locked', 'an active game → game_locked');
select is(torny_ttc.shape(12), 'false|11|Lag 11', 'active game: nothing moved');

select is(torny_ttc.transfer(9, 0, 2), 'game_not_found', 'an unknown game → game_not_found');

-- ── 2. The captain hands the armband to teammate 2 ───────────────────────────
select is(torny_ttc.transfer(1, 1, 2), 'ok', 'the captain → ok');
select is(torny_ttc.shape(2), 'true|-|Lag 1', 'the new captain has the team name and no parent');
select is(torny_ttc.shape(1), 'false|2|Lag 1', 'the old captain is a member under the new one');
select is(torny_ttc.shape(3), 'false|2|Lag 1', 'an approved teammate points at the new captain');
select is(torny_ttc.shape(4), 'false|2|Lag 1', 'a pending teammate points at the new captain');
select is(torny_ttc.team_numbers(1), '1:1,2:1,3:1,5:2,6:2', 'team numbers are unchanged');
select is(torny_ttc.accepted(1, 1), 'yes', 'the old captain''s roster place is confirmed');
select is(torny_ttc.accepted(1, 3), 'no', 'another teammate''s roster place is left as it was');
select is(torny_ttc.accepted(1, 2), 'no', 'the new captain''s roster place is left as it was');

-- ── 3. The organiser and an admin may move it too ────────────────────────────
select is(torny_ttc.transfer(1, 0, 6), 'ok', 'the game creator → ok');
select is(torny_ttc.shape(6), 'true|-|Lag 5', 'creator: the new captain of team 2');
select is(torny_ttc.shape(5), 'false|6|Lag 5', 'creator: the old captain of team 2 is a member');

select is(torny_ttc.transfer(1, 99, 3), 'ok', 'a global admin → ok');
select is(torny_ttc.shape(3), 'true|-|Lag 1', 'admin: teammate 3 is captain');
select is(torny_ttc.shape(1), 'false|3|Lag 1', 'admin: every other member follows, the first captain too');

-- ── 4. Only the service role may call it ─────────────────────────────────────
select ok(
  not has_function_privilege('anon', 'public.transfer_team_captaincy(uuid, uuid, uuid)', 'execute'),
  'anon may not execute transfer_team_captaincy');
select ok(
  not has_function_privilege('authenticated', 'public.transfer_team_captaincy(uuid, uuid, uuid)', 'execute'),
  'authenticated may not execute transfer_team_captaincy');
select ok(
  has_function_privilege('service_role', 'public.transfer_team_captaincy(uuid, uuid, uuid)', 'execute'),
  'service_role may execute transfer_team_captaincy');

select * from finish();
rollback;
