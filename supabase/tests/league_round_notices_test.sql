-- supabase/tests/league_round_notices_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- The league round's two messages (#2638 Del 3, migration 0217): the stamps
-- that make each go once per round, and the reset that gives an extended
-- window a new reminder (league_rounds_notice_stamps).
--
-- Only the server writes the stamps:
--   1  the organiser sets closing_reminder_sent_at                  → 42501
--   2  the organiser clears opening_notice_sent_at                  → 42501
--   3  the organiser inserts a round with a stamp                   → 42501
--   4  the server (no JWT) sets both stamps                         → 1 row
-- A changed deadline clears the reminder, nothing else does:
--   5  the organiser extends closes_at                              → 1 row
--   6  …the reminder stamp is cleared, the opening stamp is kept
--   7  the organiser changes the label                              → 1 row
--   8  …both stamps are kept
--   9  the server moves closes_at (shortens it)                      → reminder cleared
--  10  the trigger function is not client-executable
--
-- Every 42501 case checks the code and the exact message (throws_ok).
-- Red without 0217: every case (the columns do not exist). Without the
-- guard half of the trigger: 1–3. Without the reset half: 6 and 9.
-- Each case that writes runs in its own savepoint and is rolled back.
-- Every probe and its check are separate statements (#1910).
-- Depends on 0080, 0212–0217. Run via: supabase test db (see supabase/tests/README.md)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

\ir fixtures/rls_helpers.psql

-- ── Scenario-local fixtures (ln_ = league notices) ────────────────────────────
create or replace function torny_rls.ln_club_admin() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-263800000201'::uuid $$;
create or replace function torny_rls.ln_player()     returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-263800000202'::uuid $$;
create or replace function torny_rls.ln_club()       returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-263800000211'::uuid $$;
create or replace function torny_rls.ln_league()     returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-263800000221'::uuid $$;
create or replace function torny_rls.ln_round()      returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-263800000231'::uuid $$;
create or replace function torny_rls.ln_round_new()  returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-263800000232'::uuid $$;

-- ln_rows(sql): runs one statement as the current role and returns the number
-- of rows it touched, so an allowed update is checked, not just survived.
create or replace function torny_rls.ln_rows(p_sql text) returns int
  language plpgsql as $$
  declare v_rows int;
  begin
    execute p_sql;
    get diagnostics v_rows = row_count;
    return v_rows;
  end;
$$;

grant execute on all functions in schema torny_rls to authenticated, anon, service_role;

-- ── Seed ──────────────────────────────────────────────────────────────────────
select torny_rls.as_service();
select torny_rls.seed_active_game();

insert into auth.users (id, instance_id, aud, role, email)
select uid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
       'rls-' || uid::text || '@example.test'
  from unnest(array[torny_rls.ln_club_admin(), torny_rls.ln_player()]) as uid;

insert into public.users (id, email, name, is_admin) values
  (torny_rls.ln_club_admin(), 'rls-ln-club-admin@example.test', 'LN Club Admin', false),
  (torny_rls.ln_player(),     'rls-ln-player@example.test',     'LN Player',     false)
on conflict (id) do update
  set email = excluded.email, name = excluded.name, is_admin = excluded.is_admin;

insert into public.groups (id, name, created_by) values (torny_rls.ln_club(), 'LN Club', torny_rls.ln_club_admin());
insert into public.group_members (group_id, user_id, role) values
  (torny_rls.ln_club(), torny_rls.ln_club_admin(), 'owner'),
  (torny_rls.ln_club(), torny_rls.ln_player(),     'member');

insert into public.leagues
  (id, name, season_start, season_end, standings_model, course_scope, course_id, tee_box_id,
   status, created_by, group_id, is_simulator) values
  (torny_rls.ln_league(), 'LN Vinterliga', current_date, current_date + 90, 'total', 'single_course_single_tee',
   torny_rls.course_id(), torny_rls.tee_box_id(), 'active', torny_rls.ln_club_admin(), torny_rls.ln_club(), true);

insert into public.league_players (league_id, user_id, accepted_at) values
  (torny_rls.ln_league(), torny_rls.ln_player(), now());

-- An open round the sweep has already told: both stamps set by the server.
insert into public.league_rounds
  (id, league_id, sequence, label, course_id, tee_box_id, opens_at, closes_at, original_closes_at,
   opening_notice_sent_at, closing_reminder_sent_at) values
  (torny_rls.ln_round(), torny_rls.ln_league(), 1, 'Runde 1', torny_rls.course_id(), torny_rls.tee_box_id(),
   now() - interval '12 days', now() + interval '1 day', now() + interval '1 day',
   now() - interval '12 days', now() - interval '1 hour');

-- ═════════════════════════════════════════════════════════════════════════════
-- Only the server writes the stamps
-- ═════════════════════════════════════════════════════════════════════════════

-- 1
savepoint case_1;
select torny_rls.as_user(torny_rls.ln_club_admin());
select throws_ok(
  $$ update public.league_rounds set closing_reminder_sent_at = now() + interval '1 day'
      where id = torny_rls.ln_round() $$,
  '42501', 'league_rounds notice stamps are set by the server only',
  'case 1: the organiser CANNOT set closing_reminder_sent_at');
rollback to savepoint case_1;

-- 2
savepoint case_2;
select torny_rls.as_user(torny_rls.ln_club_admin());
select throws_ok(
  $$ update public.league_rounds set opening_notice_sent_at = null where id = torny_rls.ln_round() $$,
  '42501', 'league_rounds notice stamps are set by the server only',
  'case 2: the organiser CANNOT clear opening_notice_sent_at to send it again');
rollback to savepoint case_2;

-- 3
savepoint case_3;
select torny_rls.as_user(torny_rls.ln_club_admin());
select throws_ok(
  $$ insert into public.league_rounds
       (id, league_id, sequence, label, course_id, tee_box_id, opens_at, closes_at, original_closes_at,
        opening_notice_sent_at)
     values (torny_rls.ln_round_new(), torny_rls.ln_league(), 2, 'Runde 2', torny_rls.course_id(),
             torny_rls.tee_box_id(), now() + interval '2 days', now() + interval '16 days',
             now() + interval '16 days', now()) $$,
  '42501', 'league_rounds notice stamps are set by the server only',
  'case 3: the organiser CANNOT insert a round with a stamp');
rollback to savepoint case_3;

-- 4
savepoint case_4;
select torny_rls.as_service();
update public.league_rounds set opening_notice_sent_at = null, closing_reminder_sent_at = null
 where id = torny_rls.ln_round();
select is(
  torny_rls.ln_rows($$ update public.league_rounds
                          set opening_notice_sent_at = now(), closing_reminder_sent_at = now()
                        where id = torny_rls.ln_round()
                          and opening_notice_sent_at is null and closing_reminder_sent_at is null $$),
  1,
  'case 4: the server (the sweep) claims both stamps');
rollback to savepoint case_4;

-- ═════════════════════════════════════════════════════════════════════════════
-- A changed deadline clears the reminder, nothing else does
-- ═════════════════════════════════════════════════════════════════════════════

-- 5 + 6
savepoint case_5;
select torny_rls.as_user(torny_rls.ln_club_admin());
select is(
  torny_rls.ln_rows($$ update public.league_rounds set closes_at = now() + interval '8 days'
                        where id = torny_rls.ln_round() $$),
  1,
  'case 5: the organiser CAN extend the window of a round already reminded');
select torny_rls.as_service();
select ok(
  (select closing_reminder_sent_at is null and opening_notice_sent_at is not null
     from public.league_rounds where id = torny_rls.ln_round()),
  'case 6: the extension clears the reminder stamp and keeps the opening stamp');
rollback to savepoint case_5;

-- 7 + 8
savepoint case_7;
select torny_rls.as_user(torny_rls.ln_club_admin());
select is(
  torny_rls.ln_rows($$ update public.league_rounds set label = 'Runde 1 (Pebble Beach)'
                        where id = torny_rls.ln_round() $$),
  1,
  'case 7: the organiser CAN change the label');
select torny_rls.as_service();
select ok(
  (select closing_reminder_sent_at is not null and opening_notice_sent_at is not null
     from public.league_rounds where id = torny_rls.ln_round()),
  'case 8: a write that keeps closes_at keeps both stamps');
rollback to savepoint case_7;

-- 9
savepoint case_9;
select torny_rls.as_service();
update public.league_rounds set closes_at = now() + interval '12 hours' where id = torny_rls.ln_round();
select ok(
  (select closing_reminder_sent_at is null from public.league_rounds where id = torny_rls.ln_round()),
  'case 9: a shortened deadline (any writer) clears the reminder stamp too');
rollback to savepoint case_9;

-- 10
select ok(
  not has_function_privilege('authenticated', 'public.league_rounds_notice_stamps()', 'execute')
    and not has_function_privilege('anon', 'public.league_rounds_notice_stamps()', 'execute'),
  'case 10: the trigger function is not client-executable');

select * from finish();

rollback;
