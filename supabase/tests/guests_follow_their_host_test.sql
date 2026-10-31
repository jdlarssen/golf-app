-- supabase/tests/guests_follow_their_host_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Runtime test for migrations 0229 and 0230 (#2607): the guests a player
-- brought leave when the player's seat is deleted before the start. 0229: the
-- guests under a team captain. 0230: the guest a player brought alone
-- («Ta med en gjest», brought_by_user_id).
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
--   9. Service role deletes a player's seat: the guest the player brought goes,
--      approved and seated or pending; another player's guest stays.
--  10. The organiser's «Fjern» and the player's own delete, under RLS, take
--      the brought guest.
--  11. Account deletion (anonymize_user) takes the brought guest.
--  12. guard_brought_guest refuses a row that is not a guest's, a host who is
--      a guest or the guest itself, a host who is not on the roster, a second
--      live guest, and a row that is both a team row and a brought guest; it
--      lets a valid row through.
--  13. A player cannot give their own pending request a host (PATCH under
--      RLS), and the guard cannot be called by anon or authenticated.
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

select plan(55);

create schema if not exists torny_bgh;

-- uid(n): fixture user n. uid(0) creates every game. Guests: 2, 3, 6, 8, 11,
-- 13, 15, 17, and for 0230: 22, 26, 28, 30, 32, 34, 38.
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

-- seed_solo_game(n, status, mode): a stableford game players sign up to alone.
create or replace function torny_bgh.seed_solo_game(p_n int, p_status text, p_mode text)
  returns void language plpgsql as $$
  begin
    insert into public.games (id, name, game_mode, mode_config, status, registration_mode,
                              registration_type, created_by)
    values (torny_bgh.gid(p_n), 'BGH solo game ' || p_n, 'stableford', '{}'::jsonb,
            p_status::public.game_status, p_mode::public.registration_mode, 'solo',
            torny_bgh.uid(0));
  end;
$$;

-- brought(game, guest, status, host, captain): the guest's request with the
-- host in brought_by_user_id (0230). captain = true makes it a team row too.
create or replace function torny_bgh.brought(
  p_game int, p_user int, p_status text, p_host int, p_captain boolean default false
) returns void language plpgsql as $$
  begin
    insert into public.game_registration_requests
      (id, game_id, user_id, status, team_name, is_team_captain, brought_by_user_id)
    values (torny_bgh.rid(p_user), torny_bgh.gid(p_game), torny_bgh.uid(p_user),
            p_status::public.registration_request_status,
            case when p_captain then 'Lag ' || p_user end, p_captain, torny_bgh.uid(p_host));
  end;
$$;

-- attempt(sql): runs the statement and returns 'ok', or the error's
-- 'sqlstate message'. For writes made as another role, where pgTAP's own
-- tables are out of reach.
create or replace function torny_bgh.attempt(p_sql text) returns text
  language plpgsql as $$
  begin
    execute p_sql;
    return 'ok';
  exception when others then
    return sqlstate || ' ' || sqlerrm;
  end;
$$;

-- ── Seed ─────────────────────────────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email)
select torny_bgh.uid(n), '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated',
       'authenticated', 'bgh-' || n || '@example.test'
  from generate_series(0, 38) as n;

insert into public.users (id, email, name, is_guest)
select id, email, 'BGH ' || email,
       id in (torny_bgh.uid(2), torny_bgh.uid(3), torny_bgh.uid(6), torny_bgh.uid(8),
              torny_bgh.uid(11), torny_bgh.uid(13), torny_bgh.uid(15), torny_bgh.uid(17),
              torny_bgh.uid(22), torny_bgh.uid(26), torny_bgh.uid(28), torny_bgh.uid(30),
              torny_bgh.uid(32), torny_bgh.uid(34), torny_bgh.uid(38))
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

-- 0230: players who signed up alone and brought a guest. The host's seat comes
-- first: the guard wants the host on the roster.
-- Game 7 (scheduled, open): host 21 with guest 22 (approved, seated); host 25
-- with guest 26 (approved, seated); player 35 seated without a guest.
select torny_bgh.seed_solo_game(7, 'scheduled', 'open');
select torny_bgh.roster(7, 21);
select torny_bgh.brought(7, 22, 'approved', 21);
select torny_bgh.roster(7, 22);
select torny_bgh.roster(7, 25);
select torny_bgh.brought(7, 26, 'approved', 25);
select torny_bgh.roster(7, 26);
select torny_bgh.roster(7, 35);

-- Game 8 (scheduled, manual approval): host 27 with guest 28 (pending, no
-- seat); player 36 has a pending request of their own.
select torny_bgh.seed_solo_game(8, 'scheduled', 'manual_approval');
select torny_bgh.roster(8, 27);
select torny_bgh.brought(8, 28, 'pending', 27);
insert into public.game_registration_requests (id, game_id, user_id, status)
values (torny_bgh.rid(36), torny_bgh.gid(8), torny_bgh.uid(36), 'pending');

-- Game 9 (scheduled, open): host 29 with guest 30 — the organiser's «Fjern».
select torny_bgh.seed_solo_game(9, 'scheduled', 'open');
select torny_bgh.roster(9, 29);
select torny_bgh.brought(9, 30, 'approved', 29);
select torny_bgh.roster(9, 30);

-- Game 10 (draft, open): host 31 with guest 32 — account deletion.
select torny_bgh.seed_solo_game(10, 'draft', 'open');
select torny_bgh.roster(10, 31);
select torny_bgh.brought(10, 32, 'approved', 31);
select torny_bgh.roster(10, 32);

-- Game 11 (scheduled, open): host 37 with guest 38 — the host's own «Trekk meg».
select torny_bgh.seed_solo_game(11, 'scheduled', 'open');
select torny_bgh.roster(11, 37);
select torny_bgh.brought(11, 38, 'approved', 37);
select torny_bgh.roster(11, 38);

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

-- ── 9. 0230: service role deletes the host's seat ───────────────────────────
select torny_bgh.drop_seat(7, 21);
select is(torny_bgh.seat(7, 22), 'no', 'brought guest: leaves with the host');
select is(torny_bgh.req(22), 'withdrawn', 'brought guest: the request is withdrawn');
select is(torny_bgh.decided_by(22), '21', 'brought guest: no caller, the host decided');
select is(torny_bgh.seat(7, 26), 'yes', 'brought guest: another host''s guest keeps the seat');
select is(torny_bgh.req(26), 'approved', 'brought guest: another host''s guest keeps the request');
select torny_bgh.drop_seat(8, 27);
select is(torny_bgh.req(28), 'withdrawn', 'brought guest: a pending guest is withdrawn too');

-- ── 10. 0230: the organiser's «Fjern» and the host's own delete, under RLS ───
create temp table bgh_brought_delete(who text, n int);
grant all on bgh_brought_delete to authenticated;
grant execute on all functions in schema torny_bgh to authenticated;
select torny_bgh.as_user(torny_bgh.uid(0));
with gone as (
  delete from public.game_players
   where game_id = torny_bgh.gid(9) and user_id = torny_bgh.uid(29)
  returning 1
)
insert into bgh_brought_delete select 'organiser', count(*) from gone;
select torny_bgh.as_postgres();
select torny_bgh.as_user(torny_bgh.uid(37));
with gone as (
  delete from public.game_players
   where game_id = torny_bgh.gid(11) and user_id = torny_bgh.uid(37)
  returning 1
)
insert into bgh_brought_delete select 'host', count(*) from gone;
select torny_bgh.as_postgres();
select is((select n from bgh_brought_delete where who = 'organiser'), 1,
  'brought guest: the organiser deletes the host''s seat under RLS');
select is(torny_bgh.seat(9, 30), 'no', 'brought guest: leaves when the organiser removes the host');
select is(torny_bgh.req(30), 'withdrawn', 'brought guest: withdrawn by the organiser''s «Fjern»');
select is(torny_bgh.decided_by(30), '0', 'brought guest: the organiser is recorded as the one who decided');
select is((select n from bgh_brought_delete where who = 'host'), 1,
  'brought guest: the host deletes their own seat under RLS');
select is(torny_bgh.seat(11, 38), 'no', 'brought guest: leaves when the host withdraws');
select is(torny_bgh.req(38), 'withdrawn', 'brought guest: withdrawn by the host''s «Trekk meg»');
select is(torny_bgh.decided_by(38), '37', 'brought guest: the host is recorded as the one who decided');

-- ── 11. 0230: account deletion ───────────────────────────────────────────────
select public.anonymize_user(torny_bgh.uid(31));
select is(torny_bgh.seat(10, 32), 'no', 'brought guest: account deletion takes the guest''s seat');
select is(torny_bgh.req(32), 'withdrawn', 'brought guest: account deletion withdraws the guest''s request');

-- ── 12. 0230: the guard ──────────────────────────────────────────────────────
select throws_ok('select torny_bgh.brought(7, 33, ''approved'', 35)',
  '23514', 'not_a_guest', 'guard: a player with an account cannot be brought as a guest');
select throws_ok('select torny_bgh.brought(7, 34, ''approved'', 26)',
  '23514', 'not_a_guest', 'guard: a guest cannot bring a guest');
select throws_ok('select torny_bgh.brought(7, 34, ''approved'', 34)',
  '23514', 'not_a_guest', 'guard: a guest cannot be its own host');
select throws_ok('select torny_bgh.brought(7, 34, ''approved'', 33)',
  '23514', 'host_not_on_roster', 'guard: a host who is not signed up cannot bring a guest');
select throws_ok('select torny_bgh.brought(7, 34, ''approved'', 25)',
  '23514', 'brought_guest_limit', 'guard: one live guest per host');
select throws_like('select torny_bgh.brought(7, 34, ''approved'', 35, true)',
  '%brought_guest_not_in_team%', 'a row is a team row or a brought guest, never both');
select lives_ok('select torny_bgh.brought(7, 34, ''approved'', 35)',
  'guard: a signed-up player brings one guest');

-- ── 13. 0230: no host by PATCH, and trigger only ─────────────────────────────
create temp table bgh_patch(r text);
grant all on bgh_patch to authenticated;
grant execute on all functions in schema torny_bgh to authenticated;
select torny_bgh.as_user(torny_bgh.uid(36));
insert into bgh_patch select torny_bgh.attempt(format(
  'update public.game_registration_requests set brought_by_user_id = %L, status = ''withdrawn'' where id = %L',
  torny_bgh.uid(27), torny_bgh.rid(36)));
select torny_bgh.as_postgres();
select is((select r from bgh_patch), '23514 not_a_guest',
  'PATCH: a player cannot give their own pending request a host');
select is(torny_bgh.req(36), 'pending', 'PATCH: the player''s request is unchanged');
select ok(
  not has_function_privilege('anon', 'public.guard_brought_guest()', 'execute'),
  'anon may not execute guard_brought_guest');
select ok(
  not has_function_privilege('authenticated', 'public.guard_brought_guest()', 'execute'),
  'authenticated may not execute guard_brought_guest');

select * from finish();
rollback;
