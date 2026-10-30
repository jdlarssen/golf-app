-- supabase/tests/guests_follow_their_host_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Runtime test for migration 0229 (#2607): the guests a captain brought leave
-- when the captain's seat is deleted before the start.
--
--   1. Service role (withdrawSelf, removePlayerFromGame's write): deleting the
--      captain's roster row withdraws the guests under the captain, approved
--      and pending; a teammate with an account and another team's guest stay.
--   2. No cascade for a player who is not a captain, nor for a guest's own row.
--   3. A started game: the guest plays on.
--   4. The app's «Fjern»: the organiser deletes the captain's row under RLS;
--      the guests go, decided by the organiser.
--   5. Account deletion (anonymize_user) before the start takes the guests.
--   6. A failed cascade rolls the captain's delete back too, and a retry then
--      takes the guests.
--   7. Host and guest deleted in one statement (the approval's compensation,
--      or «Rediger» removing both): the guest's request is left as it was.
--   8. The trigger function cannot be called by anon or authenticated.
--   0. A delete that matches no row returns: a statement trigger fires on a
--      0-row statement too, and the cascade's own delete is one, so without
--      the early return every delete on game_players recursed until the stack
--      gave out (caught on staging 30.10).
--
-- Every write is its own statement and its effect is read in the NEXT
-- statement: a statement does not see its own writes (#1910).
--
-- Fixtures live in their own `torny_bgh` schema. Inlined helpers so the file
-- also runs as a rolled-back probe on staging (no `\ir` there).
--
-- Run via: supabase test db   (or `npm run test:rls`)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(28);

create schema if not exists torny_bgh;

-- uid(n): fixture user n. uid(0) creates every game. Guests: 2, 3, 6, 8, 11,
-- 13, 15, 17.
create or replace function torny_bgh.uid(n int) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-b607-1' || lpad(n::text, 11, '0'))::uuid
$$;
create or replace function torny_bgh.gid(n int) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-b607-2' || lpad(n::text, 11, '0'))::uuid
$$;
create or replace function torny_bgh.rid(n int) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-b607-3' || lpad(n::text, 11, '0'))::uuid
$$;

create or replace function torny_bgh.seed_game(p_n int, p_status text) returns void
  language plpgsql as $$
  begin
    insert into public.games (id, name, game_mode, mode_config, status, registration_mode,
                              registration_type, created_by)
    values (torny_bgh.gid(p_n), 'BGH game ' || p_n, 'texas_scramble',
            jsonb_build_object('team_size', 4), p_status::public.game_status, 'open', 'team',
            torny_bgh.uid(0));
  end;
$$;

-- request(game, user, status, captain_of): captain_of null = the team's captain.
create or replace function torny_bgh.request(
  p_game int, p_user int, p_status text, p_captain_of int
) returns void language plpgsql as $$
  begin
    insert into public.game_registration_requests
      (id, game_id, user_id, status, team_name, is_team_captain, team_request_id)
    values (torny_bgh.rid(p_user), torny_bgh.gid(p_game), torny_bgh.uid(p_user),
            p_status::public.registration_request_status,
            'Lag ' || coalesce(p_captain_of, p_user),
            p_captain_of is null,
            case when p_captain_of is null then null else torny_bgh.rid(p_captain_of) end);
  end;
$$;

create or replace function torny_bgh.roster(p_game int, p_user int) returns void
  language sql as $$
  insert into public.game_players (game_id, user_id, team_number, flight_number, accepted_at)
  values (torny_bgh.gid(p_game), torny_bgh.uid(p_user), 1, 1, now())
$$;

-- seat(game, user): 'yes' when the roster row exists.
create or replace function torny_bgh.seat(p_game int, p_user int) returns text
  language sql stable as $$
  select case when exists (
    select 1 from public.game_players
     where game_id = torny_bgh.gid(p_game) and user_id = torny_bgh.uid(p_user)
  ) then 'yes' else 'no' end
$$;

-- req(user): status of uid(n)'s request, '-' when there is none.
create or replace function torny_bgh.req(p_user int) returns text language sql stable as $$
  select coalesce((select status::text from public.game_registration_requests
                    where id = torny_bgh.rid(p_user)), '-')
$$;

create or replace function torny_bgh.decided_by(p_user int) returns text language sql stable as $$
  select coalesce((select substr(decided_by_user_id::text, 26)::int::text
                     from public.game_registration_requests
                    where id = torny_bgh.rid(p_user)), '-')
$$;

create or replace function torny_bgh.drop_seat(p_game int, p_user int) returns void
  language sql as $$
  delete from public.game_players
   where game_id = torny_bgh.gid(p_game) and user_id = torny_bgh.uid(p_user)
$$;

-- ── Seed ─────────────────────────────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email)
select torny_bgh.uid(n), '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated',
       'authenticated', 'bgh-' || n || '@example.test'
  from generate_series(0, 20) as n;

insert into public.users (id, email, name, is_guest)
select id, email, 'BGH ' || email,
       id in (torny_bgh.uid(2), torny_bgh.uid(3), torny_bgh.uid(6), torny_bgh.uid(8),
              torny_bgh.uid(11), torny_bgh.uid(13), torny_bgh.uid(15), torny_bgh.uid(17))
  from auth.users
 where email like 'bgh-%@example.test'
on conflict (id) do update set email = excluded.email, name = excluded.name,
  is_guest = excluded.is_guest;

-- Game 1 (scheduled). Team 1: captain 1, guest 2 (approved, seated), guest 3
-- (pending, no seat), teammate 4 with an account (approved, seated).
-- Team 2: captain 5, guest 6 (approved, seated). Player 9 is on team 1 too.
select torny_bgh.seed_game(1, 'scheduled');
select torny_bgh.request(1, 1, 'approved', null);
select torny_bgh.request(1, 2, 'approved', 1);
select torny_bgh.request(1, 3, 'pending', 1);
select torny_bgh.request(1, 4, 'approved', 1);
select torny_bgh.request(1, 5, 'approved', null);
select torny_bgh.request(1, 6, 'approved', 5);
select torny_bgh.roster(1, 1);
select torny_bgh.roster(1, 2);
select torny_bgh.roster(1, 4);
select torny_bgh.roster(1, 5);
select torny_bgh.roster(1, 6);

-- Game 2 (active): captain 7, guest 8.
select torny_bgh.seed_game(2, 'active');
select torny_bgh.request(2, 7, 'approved', null);
select torny_bgh.request(2, 8, 'approved', 7);
select torny_bgh.roster(2, 7);
select torny_bgh.roster(2, 8);

-- Game 3 (scheduled): captain 12, guest 13 — the app's organiser «Fjern».
select torny_bgh.seed_game(3, 'scheduled');
select torny_bgh.request(3, 12, 'approved', null);
select torny_bgh.request(3, 13, 'approved', 12);
select torny_bgh.roster(3, 12);
select torny_bgh.roster(3, 13);

-- Game 4 (draft): captain 14, guest 15 — account deletion.
select torny_bgh.seed_game(4, 'draft');
select torny_bgh.request(4, 14, 'approved', null);
select torny_bgh.request(4, 15, 'approved', 14);
select torny_bgh.roster(4, 14);
select torny_bgh.roster(4, 15);

-- Game 5 (scheduled): captain 16, guest 17 — a failed cascade, then a retry.
select torny_bgh.seed_game(5, 'scheduled');
select torny_bgh.request(5, 16, 'approved', null);
select torny_bgh.request(5, 17, 'approved', 16);
select torny_bgh.roster(5, 16);
select torny_bgh.roster(5, 17);

-- Game 6 (scheduled): captain 10, guest 11 — both deleted in one statement.
select torny_bgh.seed_game(6, 'scheduled');
select torny_bgh.request(6, 10, 'approved', null);
select torny_bgh.request(6, 11, 'approved', 10);
select torny_bgh.roster(6, 10);
select torny_bgh.roster(6, 11);

-- ── 0. No self-recursion ────────────────────────────────────────────────────
select lives_ok(
  format('delete from public.game_players where game_id = %L', torny_bgh.gid(99)),
  'a delete that matches no row returns: the trigger does not call itself');

-- ── 1. Service role deletes the captain's seat ───────────────────────────────
select torny_bgh.drop_seat(1, 1);
select is(torny_bgh.seat(1, 2), 'no', 'the seated guest leaves with the captain');
select is(torny_bgh.req(2), 'withdrawn', 'the seated guest''s request is withdrawn');
select is(torny_bgh.req(3), 'withdrawn', 'the pending guest''s request is withdrawn');
select is(torny_bgh.decided_by(2), '1', 'no caller: the host is recorded as the one who decided');
select is(torny_bgh.seat(1, 4), 'yes', 'a teammate with an account keeps the seat');
select is(torny_bgh.req(4), 'approved', 'a teammate with an account keeps the request');
select is(torny_bgh.seat(1, 6), 'yes', 'another team''s guest keeps the seat');
select is(torny_bgh.req(6), 'approved', 'another team''s guest keeps the request');

-- ── 2. No cascade without a captain ──────────────────────────────────────────
select torny_bgh.drop_seat(1, 4);
select is(torny_bgh.seat(1, 5), 'yes', 'removing a player who is not a captain moves nobody else');
select torny_bgh.drop_seat(1, 6);
select is(torny_bgh.seat(1, 5), 'yes', 'removing a guest leaves its captain');
select is(torny_bgh.req(6), 'approved', 'removing a guest''s own seat does not touch its request');

-- ── 3. A started game ────────────────────────────────────────────────────────
select torny_bgh.drop_seat(2, 7);
select is(torny_bgh.seat(2, 8), 'yes', 'active game: the guest plays on');
select is(torny_bgh.req(8), 'approved', 'active game: the guest''s request is untouched');

-- ── 4. The app's «Fjern»: the organiser, under RLS ───────────────────────────
create or replace function torny_bgh.as_user(p_uid uuid) returns void language plpgsql as $$
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  end;
$$;
create or replace function torny_bgh.as_postgres() returns void language plpgsql as $$
  begin
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', null, true);
  end;
$$;
grant usage on schema torny_bgh to authenticated;
grant execute on all functions in schema torny_bgh to authenticated;

create temp table bgh_app_delete(n int);
grant all on bgh_app_delete to authenticated;
select torny_bgh.as_user(torny_bgh.uid(0));
with gone as (
  delete from public.game_players
   where game_id = torny_bgh.gid(3) and user_id = torny_bgh.uid(12)
  returning 1
)
insert into bgh_app_delete select count(*) from gone;
select torny_bgh.as_postgres();
select is((select n from bgh_app_delete), 1, 'app: the organiser deletes the captain''s seat under RLS');
select is(torny_bgh.seat(3, 13), 'no', 'app: the guest leaves with the captain');
select is(torny_bgh.req(13), 'withdrawn', 'app: the guest''s request is withdrawn');
select is(torny_bgh.decided_by(13), '0', 'app: the organiser is recorded as the one who decided');

-- ── 5. Account deletion ──────────────────────────────────────────────────────
select public.anonymize_user(torny_bgh.uid(14));
select is(torny_bgh.seat(4, 15), 'no', 'account deletion: the guest leaves with the captain');
select is(torny_bgh.req(15), '-', 'account deletion: no live request is left for the guest');

-- ── 6. A failed cascade, then a retry ────────────────────────────────────────
create or replace function torny_bgh.refuse_guest_17() returns trigger language plpgsql as $$
  begin
    if old.user_id = torny_bgh.uid(17) then
      raise exception 'bgh: refused';
    end if;
    return old;
  end;
$$;
create trigger bgh_refuse_guest_17 before delete on public.game_players
  for each row execute function torny_bgh.refuse_guest_17();

select throws_ok(
  format('delete from public.game_players where game_id = %L and user_id = %L',
         torny_bgh.gid(5), torny_bgh.uid(16)),
  'P0001', 'bgh: refused',
  'a failed cascade fails the captain''s delete');
select is(torny_bgh.seat(5, 16), 'yes', 'after the failure the captain''s seat is still there');
select is(torny_bgh.req(17), 'approved', 'after the failure the guest''s request is untouched');

drop trigger bgh_refuse_guest_17 on public.game_players;
select torny_bgh.drop_seat(5, 16);
select is(torny_bgh.seat(5, 17), 'no', 'retry: the guest leaves with the captain');
select is(torny_bgh.req(17), 'withdrawn', 'retry: the guest''s request is withdrawn');

-- ── 7. Host and guest in one statement ───────────────────────────────────────
delete from public.game_players
 where game_id = torny_bgh.gid(6) and user_id in (torny_bgh.uid(10), torny_bgh.uid(11));
select is(torny_bgh.req(11), 'approved', 'host and guest deleted together: the guest''s request is left as it was');

-- ── 8. Trigger only ──────────────────────────────────────────────────────────
select ok(
  not has_function_privilege('anon', 'public.withdraw_guests_of_removed_hosts()', 'execute'),
  'anon may not execute withdraw_guests_of_removed_hosts');
select ok(
  not has_function_privilege('authenticated', 'public.withdraw_guests_of_removed_hosts()', 'execute'),
  'authenticated may not execute withdraw_guests_of_removed_hosts');

select * from finish();
rollback;
