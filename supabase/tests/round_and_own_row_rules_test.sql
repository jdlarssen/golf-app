-- supabase/tests/round_and_own_row_rules_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- The rules migration 0251 put in the database (owner-ordered audit 20.11).
-- Every case is a signed-in, non-admin request made directly, past the screens.
--
-- games
--    1  a creator deletes their own scheduled round
--    2  … not a round in progress                      (0 rows)
--    3  … not a finished round                         (0 rows)
--    4  an admin deletes a finished round
--    5  a creator does not move finished back to active        → 42501
--    6  a creator does not move active back to scheduled       → 42501
--    7  a creator starts a scheduled round (scheduled → active)
--    8  a creator finishes it (active → finished)
--    9  an admin reopens it (finished → active)
--   10  the service role moves a round back
--
-- game_players
--   11  a creator does not remove a roster row once the round is in progress
--   12  a creator removes a roster row before the start
--   13  a creator does not insert a row with a handicap result  → 42501
--   14  … nor a delivered row                                   → 42501
--   15  a creator inserts a plain row
--   16  a player does not write result_summary on their own row → 42501
--   17  a creator does not write it on another player's row     → 42501
--   18  a player does not change tee_gender after the start     → 42501
--   19  a player changes tee_gender before the start
--   20  a player does not write a rejection reason on their row → 42501
--   21  a player clears the rejection reason (re-delivery)
--   22  a player confirms (accepted_at null → set)
--   23  a player does not take the confirmation back            → 42501
--       (writing it again is allowed: case 44)
--   24  a player does not stamp deliver_reminder_sent_at        → 42501
--   25  the service role writes result_summary
--
-- scores
--   26  a new row stamped far ahead is stored with the server's time
--   27  a stamp 3 minutes ahead is kept (clock skew)
--   28  a stamp 3 days old is kept (a phone that was offline)
--   29  an admin's far-ahead stamp is kept (the bypass of 0109)
--
-- green_pins
--   30  no pin from a player who is not in a round in progress on the course → 42501
--   31  no pin from a withdrawn player                                       → 42501
--   32  a second pin on the same hole from the same player                   → 23505
--
-- idea_submissions
--   33  a new idea does not arrive marked as built → 42501
--   34  a plain idea is saved
--
-- guests
--   35  another organiser's guest does not go on a creator's roster → 42501
--   36  the one who made the guest puts it on their own roster
--   37  a guest already in one of the creator's rounds goes on a new one
--   38  foreign_guest_ids names the guest, not the ordinary player
--   39  … and names nothing for an admin
--   40  a client cannot call foreign_guest_ids                → 42501
--   41  a client cannot read users.guest_created_by           → 42501
--
-- admin_action_rate_limit
--   42  the purge deletes a bucket older than 2 days and keeps a fresh one
--   43  a client cannot call the purge                        → 42501
--
-- added after review
--   44  the organiser's publish retry writes their own confirmed row again
--       (accepted_at set → set, the app's replacePlayers upsert)
--   45  a player cannot write users.guest_created_by on their own row → 42501
--   46  the service role writes it
--
-- Run via:  supabase test db   (see supabase/tests/README.md)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(46);

\ir fixtures/rls_helpers.psql

-- ── Fixtures ─────────────────────────────────────────────────────────────────
-- The seed game is in progress and created by admin_id. The games below are
-- created by active_id, a plain player, so the creator rules have a
-- non-admin creator to test.
select torny_rls.as_service();
select torny_rls.seed_active_game();

create or replace function torny_rls.rr_scheduled() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-0000000006a1'::uuid $$;
create or replace function torny_rls.rr_active()    returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-0000000006a2'::uuid $$;
create or replace function torny_rls.rr_finished()  returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-0000000006a3'::uuid $$;
create or replace function torny_rls.rr_spare()     returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-0000000006a4'::uuid $$;
create or replace function torny_rls.rr_mates()     returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-0000000006a5'::uuid $$;
create or replace function torny_rls.rr_guest()     returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-0000000006b1'::uuid $$;

insert into public.games (id, name, course_id, tee_box_id, status, game_mode, created_by, started_at) values
  (torny_rls.rr_scheduled(), 'RR scheduled', torny_rls.course_id(), torny_rls.tee_box_id(), 'scheduled', 'solo_strokeplay', torny_rls.active_id(), null),
  (torny_rls.rr_active(),    'RR active',    torny_rls.course_id(), torny_rls.tee_box_id(), 'active',    'solo_strokeplay', torny_rls.active_id(), now()),
  (torny_rls.rr_finished(),  'RR finished',  torny_rls.course_id(), torny_rls.tee_box_id(), 'finished',  'solo_strokeplay', torny_rls.active_id(), now()),
  (torny_rls.rr_spare(),     'RR spare',     torny_rls.course_id(), torny_rls.tee_box_id(), 'scheduled', 'solo_strokeplay', torny_rls.active_id(), null),
  -- A round the flightmate created, for the guest they made.
  (torny_rls.rr_mates(),     'RR mates',     torny_rls.course_id(), torny_rls.tee_box_id(), 'scheduled', 'solo_strokeplay', torny_rls.flightmate_id(), null);

insert into public.game_players (game_id, user_id, team_number, flight_number)
  select g, u, 1, 1
    from unnest(array[torny_rls.rr_scheduled(), torny_rls.rr_active(), torny_rls.rr_finished()]) g,
         unnest(array[torny_rls.active_id(), torny_rls.flightmate_id()]) u;

-- A guest the flightmate made. On the seed game's roster, so active_id shares
-- a round with the guest: enough for the invite gate (0208), not for 0251.
insert into auth.users (id, instance_id, aud, role, email)
  values (torny_rls.rr_guest(), '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'rr-guest@example.test');
insert into public.users (id, email, name, is_guest, guest_created_by)
  values (torny_rls.rr_guest(), 'rr-guest@example.test', 'RR Guest', true, torny_rls.flightmate_id())
  on conflict (id) do update
    set name = excluded.name, is_guest = true, guest_created_by = excluded.guest_created_by;
insert into public.game_players (game_id, user_id, team_number, flight_number)
  values (torny_rls.game_id(), torny_rls.rr_guest(), 1, 1);

-- rows_of(sql): run a statement as the current role and return how many rows
-- it touched; -1 when the database refused it with 42501.
create or replace function torny_rls.rows_of(p_sql text) returns int
  language plpgsql
  as $$
  declare v_rows int;
  begin
    execute p_sql;
    get diagnostics v_rows = row_count;
    return v_rows;
  exception
    when insufficient_privilege then return -1;
  end;
  $$;

-- rr_retry_upsert(): the roster upsert of the app's publish retry
-- (replacePlayers), for the caller's own row in the scheduled round.
create or replace function torny_rls.rr_retry_upsert() returns int
  language sql as $f$
  select torny_rls.rows_of(format(
    $q$insert into public.game_players (game_id, user_id, team_number, flight_number, tee_gender, course_handicap, accepted_at)
       values (%L, %L, 1, 1, 'ladies', null, clock_timestamp())
       on conflict (game_id, user_id) do update
         set team_number = excluded.team_number,
             flight_number = excluded.flight_number,
             tee_gender = excluded.tee_gender,
             course_handicap = excluded.course_handicap,
             accepted_at = excluded.accepted_at$q$,
    torny_rls.rr_scheduled(), torny_rls.active_id()));
$f$;

grant execute on all functions in schema torny_rls to authenticated, anon, service_role;

-- ── games: delete ────────────────────────────────────────────────────────────
select torny_rls.as_user(torny_rls.active_id());

select is(
  torny_rls.rows_of(format('delete from public.games where id = %L', torny_rls.rr_spare())),
  1, 'a creator deletes their own scheduled round'
);
select is(
  torny_rls.rows_of(format('delete from public.games where id = %L', torny_rls.rr_active())),
  0, 'a creator does not delete their own round in progress'
);
select is(
  torny_rls.rows_of(format('delete from public.games where id = %L', torny_rls.rr_finished())),
  0, 'a creator does not delete their own finished round'
);

-- An admin still deletes a finished round (a copy, so the one above stays).
select torny_rls.as_service();
insert into public.games (id, name, course_id, tee_box_id, status, game_mode, created_by, started_at)
  values (torny_rls.rr_spare(), 'RR spare 2', torny_rls.course_id(), torny_rls.tee_box_id(), 'finished', 'solo_strokeplay', torny_rls.active_id(), now());
select torny_rls.as_user(torny_rls.admin_id());
select is(
  torny_rls.rows_of(format('delete from public.games where id = %L', torny_rls.rr_spare())),
  1, 'an admin deletes a finished round'
);

-- ── games: status ────────────────────────────────────────────────────────────
select torny_rls.as_user(torny_rls.active_id());

select is(
  torny_rls.rows_of(format($q$update public.games set status = 'active' where id = %L$q$, torny_rls.rr_finished())),
  -1, 'a creator does not move a finished round back to active'
);
select is(
  torny_rls.rows_of(format($q$update public.games set status = 'scheduled' where id = %L$q$, torny_rls.rr_active())),
  -1, 'a creator does not move a round in progress back to scheduled'
);
select is(
  torny_rls.rows_of(format($q$update public.games set status = 'active', started_at = now() where id = %L$q$, torny_rls.rr_scheduled())),
  1, 'a creator starts a scheduled round'
);
select is(
  torny_rls.rows_of(format($q$update public.games set status = 'finished', ended_at = now() where id = %L$q$, torny_rls.rr_scheduled())),
  1, 'a creator finishes a round in progress'
);

select torny_rls.as_user(torny_rls.admin_id());
select is(
  torny_rls.rows_of(format($q$update public.games set status = 'active', ended_at = null where id = %L$q$, torny_rls.rr_scheduled())),
  1, 'an admin reopens a finished round'
);

select torny_rls.as_service();
select is(
  torny_rls.rows_of(format($q$update public.games set status = 'scheduled', started_at = null where id = %L$q$, torny_rls.rr_scheduled())),
  1, 'the service role moves a round back'
);

-- ── game_players: roster delete and insert ───────────────────────────────────
select torny_rls.as_user(torny_rls.active_id());

select is(
  torny_rls.rows_of(format('delete from public.game_players where game_id = %L and user_id = %L',
                           torny_rls.rr_active(), torny_rls.flightmate_id())),
  0, 'a creator does not remove a roster row once the round is in progress'
);
select is(
  torny_rls.rows_of(format('delete from public.game_players where game_id = %L and user_id = %L',
                           torny_rls.rr_scheduled(), torny_rls.flightmate_id())),
  1, 'a creator removes a roster row before the start'
);

-- submitted_id shares the seed game with active_id, so the invite gate (0208)
-- lets the row through and the refusals below come from 0251.
select throws_ok(
  format($q$insert into public.game_players (game_id, user_id, team_number, flight_number, score_differential, result_summary)
            values (%L, %L, 1, 1, -4.2, '{"place": 1}'::jsonb)$q$,
         torny_rls.rr_finished(), torny_rls.submitted_id()),
  '42501', null,
  'a creator does not insert a roster row with a handicap result'
);
select throws_ok(
  format($q$insert into public.game_players (game_id, user_id, team_number, flight_number, submitted_at)
            values (%L, %L, 1, 1, now())$q$,
         torny_rls.rr_finished(), torny_rls.submitted_id()),
  '42501', null,
  'a creator does not insert a delivered roster row'
);
select lives_ok(
  format($q$insert into public.game_players (game_id, user_id, team_number, flight_number, accepted_at)
            values (%L, %L, 1, 1, null)$q$,
         torny_rls.rr_scheduled(), torny_rls.submitted_id()),
  'a creator inserts a plain roster row'
);

-- ── game_players: system columns and the own row ─────────────────────────────
select throws_ok(
  format($q$update public.game_players set result_summary = '{"place": 1}'::jsonb
             where game_id = %L and user_id = %L$q$, torny_rls.rr_finished(), torny_rls.active_id()),
  '42501', null,
  'a player does not write result_summary on their own row'
);
select throws_ok(
  format($q$update public.game_players set result_summary = '{"place": 9}'::jsonb
             where game_id = %L and user_id = %L$q$, torny_rls.rr_finished(), torny_rls.flightmate_id()),
  '42501', null,
  'a creator does not write result_summary on another player''s row'
);
select throws_ok(
  format($q$update public.game_players set tee_gender = 'ladies'
             where game_id = %L and user_id = %L$q$, torny_rls.rr_active(), torny_rls.active_id()),
  '42501', null,
  'a player does not change their own tee_gender after the start'
);
select is(
  torny_rls.rows_of(format($q$update public.game_players set tee_gender = 'ladies'
                               where game_id = %L and user_id = %L$q$, torny_rls.rr_scheduled(), torny_rls.active_id())),
  1, 'a player changes their own tee_gender before the start'
);
select throws_ok(
  format($q$update public.game_players set rejection_reason = 'x'
             where game_id = %L and user_id = %L$q$, torny_rls.rr_active(), torny_rls.active_id()),
  '42501', null,
  'a player does not write a rejection reason on their own row'
);

select torny_rls.as_service();
update public.game_players set rejection_reason = 'Hull 7 mangler'
 where game_id = torny_rls.rr_active() and user_id = torny_rls.active_id();
select torny_rls.as_user(torny_rls.active_id());

select is(
  torny_rls.rows_of(format($q$update public.game_players set rejection_reason = null, submitted_at = now()
                               where game_id = %L and user_id = %L$q$, torny_rls.rr_active(), torny_rls.active_id())),
  1, 'a player clears the rejection reason when they deliver again'
);
select is(
  torny_rls.rows_of(format($q$update public.game_players set accepted_at = now()
                               where game_id = %L and user_id = %L$q$, torny_rls.rr_finished(), torny_rls.active_id())),
  1, 'a player confirms their seat (accepted_at set once)'
);
select throws_ok(
  format($q$update public.game_players set accepted_at = null
             where game_id = %L and user_id = %L$q$, torny_rls.rr_finished(), torny_rls.active_id()),
  '42501', null,
  'a player does not take the confirmation back'
);
select throws_ok(
  format($q$update public.game_players set deliver_reminder_sent_at = now()
             where game_id = %L and user_id = %L$q$, torny_rls.rr_finished(), torny_rls.active_id()),
  '42501', null,
  'a player does not stamp deliver_reminder_sent_at'
);

select torny_rls.as_service();
select is(
  torny_rls.rows_of(format($q$update public.game_players set result_summary = '{"place": 2}'::jsonb
                               where game_id = %L and user_id = %L$q$, torny_rls.rr_finished(), torny_rls.active_id())),
  1, 'the service role writes result_summary'
);

-- ── scores: the stamp on a new row ───────────────────────────────────────────
-- In the seed game (in progress). The flightmate enters for active_id.
select torny_rls.as_user(torny_rls.flightmate_id());
insert into public.scores (game_id, user_id, hole_number, strokes, entered_by, client_updated_at) values
  (torny_rls.game_id(), torny_rls.active_id(), 17, 9, torny_rls.flightmate_id(), '2099-01-01T00:00:00Z'),
  (torny_rls.game_id(), torny_rls.active_id(), 18, 4, torny_rls.flightmate_id(), now() + interval '3 minutes'),
  (torny_rls.game_id(), torny_rls.flightmate_id(), 17, 4, torny_rls.flightmate_id(), now() - interval '3 days');

select torny_rls.as_user(torny_rls.admin_id());
insert into public.scores (game_id, user_id, hole_number, strokes, entered_by, client_updated_at)
  values (torny_rls.game_id(), torny_rls.admin_id(), 17, 4, torny_rls.admin_id(), '2099-01-01T00:00:00Z');

select torny_rls.as_service();
select ok(
  (select strokes = 9 and client_updated_at <= now()
     from public.scores
    where game_id = torny_rls.game_id() and user_id = torny_rls.active_id() and hole_number = 17),
  'a new score stamped far ahead is kept, with the server''s time as its stamp'
);
select ok(
  (select client_updated_at > now() + interval '2 minutes'
     from public.scores
    where game_id = torny_rls.game_id() and user_id = torny_rls.active_id() and hole_number = 18),
  'a stamp 3 minutes ahead is kept as it is (clock skew)'
);
select ok(
  (select client_updated_at < now() - interval '2 days'
     from public.scores
    where game_id = torny_rls.game_id() and user_id = torny_rls.flightmate_id() and hole_number = 17),
  'a stamp 3 days old is kept as it is (a phone that was offline)'
);
select ok(
  (select client_updated_at > now() + interval '1 year'
     from public.scores
    where game_id = torny_rls.game_id() and user_id = torny_rls.admin_id() and hole_number = 17),
  'an admin''s far-ahead stamp is kept (the bypass of 0109)'
);

-- ── green_pins ───────────────────────────────────────────────────────────────
select torny_rls.as_user(torny_rls.outsider_id());
select throws_ok(
  format($q$insert into public.green_pins (course_id, hole_number, lat, lng, accuracy_m, user_id)
            values (%L, 9, 59.9139, 10.7522, 8, %L)$q$, torny_rls.course_id(), torny_rls.outsider_id()),
  '42501', null,
  'no pin from a player who is not in a round in progress on the course'
);

select torny_rls.as_user(torny_rls.withdrawn_id());
select throws_ok(
  format($q$insert into public.green_pins (course_id, hole_number, lat, lng, accuracy_m, user_id)
            values (%L, 9, 59.9139, 10.7522, 8, %L)$q$, torny_rls.course_id(), torny_rls.withdrawn_id()),
  '42501', null,
  'no pin from a withdrawn player'
);

select torny_rls.as_user(torny_rls.submitted_id());
insert into public.green_pins (course_id, hole_number, lat, lng, accuracy_m, user_id)
  values (torny_rls.course_id(), 9, 59.9139, 10.7522, 8, torny_rls.submitted_id());
select throws_ok(
  format($q$insert into public.green_pins (course_id, hole_number, lat, lng, accuracy_m, user_id)
            values (%L, 9, 59.9139, 10.7522, 8, %L)$q$, torny_rls.course_id(), torny_rls.submitted_id()),
  '23505', null,
  'a second pin on the same hole from the same player is refused as already given'
);

-- ── idea_submissions ─────────────────────────────────────────────────────────
select torny_rls.as_user(torny_rls.active_id());
select throws_ok(
  format($q$insert into public.idea_submissions (user_id, text, status, built_at)
            values (%L, 'RR idea', 'bygd', now())$q$, torny_rls.active_id()),
  '42501', null,
  'a new idea does not arrive marked as built'
);
select lives_ok(
  format($q$insert into public.idea_submissions (user_id, text) values (%L, 'RR idea')$q$, torny_rls.active_id()),
  'a plain idea is saved'
);

-- ── guests ───────────────────────────────────────────────────────────────────
select throws_ok(
  format($q$insert into public.game_players (game_id, user_id, team_number, flight_number)
            values (%L, %L, 1, 1)$q$, torny_rls.rr_scheduled(), torny_rls.rr_guest()),
  '42501', null,
  'another organiser''s guest does not go on a creator''s roster'
);

select torny_rls.as_user(torny_rls.flightmate_id());
select lives_ok(
  format($q$insert into public.game_players (game_id, user_id, team_number, flight_number)
            values (%L, %L, 1, 1)$q$, torny_rls.rr_mates(), torny_rls.rr_guest()),
  'the one who made the guest puts it on their own roster'
);

-- The guest played in one of active_id's rounds (put there by an admin or
-- brought by a player): active_id may take the guest along to the next one.
select torny_rls.as_service();
insert into public.game_players (game_id, user_id, team_number, flight_number)
  values (torny_rls.rr_finished(), torny_rls.rr_guest(), 1, 1);
select torny_rls.as_user(torny_rls.active_id());
select lives_ok(
  format($q$insert into public.game_players (game_id, user_id, team_number, flight_number)
            values (%L, %L, 1, 1)$q$, torny_rls.rr_scheduled(), torny_rls.rr_guest()),
  'a guest already in one of the creator''s rounds goes on a new one'
);

select torny_rls.as_service();
delete from public.game_players
 where user_id = torny_rls.rr_guest()
   and game_id in (torny_rls.rr_finished(), torny_rls.rr_scheduled());

select is(
  (select array_agg(x) from public.foreign_guest_ids(
     torny_rls.active_id(), array[torny_rls.rr_guest(), torny_rls.submitted_id()]) x),
  array[torny_rls.rr_guest()],
  'foreign_guest_ids names the guest that is not the caller''s, and no ordinary player'
);
select is(
  (select array_agg(x) from public.foreign_guest_ids(
     torny_rls.admin_id(), array[torny_rls.rr_guest()]) x),
  null::uuid[],
  'foreign_guest_ids names nothing for an admin'
);

select torny_rls.as_user(torny_rls.active_id());
select throws_ok(
  format($q$select * from public.foreign_guest_ids(%L, array[%L]::uuid[])$q$,
         torny_rls.active_id(), torny_rls.rr_guest()),
  '42501', null,
  'a client cannot call foreign_guest_ids'
);
select throws_ok(
  format($q$select guest_created_by from public.users where id = %L$q$, torny_rls.active_id()),
  '42501', null,
  'a client cannot read users.guest_created_by'
);

-- ── admin_action_rate_limit ──────────────────────────────────────────────────
select torny_rls.as_service();
insert into public.admin_action_rate_limit (bucket, count, window_start) values
  ('rr:old',   3, now() - interval '3 days'),
  ('rr:fresh', 3, now() - interval '1 hour');
select public.purge_admin_action_rate_limit();
select is(
  (select array_agg(bucket order by bucket) from public.admin_action_rate_limit where bucket like 'rr:%'),
  array['rr:fresh'],
  'the purge deletes a bucket older than 2 days and keeps a fresh one'
);

select torny_rls.as_user(torny_rls.active_id());
select throws_ok(
  $q$select public.purge_admin_action_rate_limit()$q$,
  '42501', null,
  'a client cannot call the purge'
);

-- ── added after review ───────────────────────────────────────────────────────
-- The app's publish retry (replacePlayers) upserts every roster row again,
-- the organiser's own confirmed row included, with a fresh accepted_at.
select torny_rls.as_user(torny_rls.active_id());
-- First run: the row is confirmed (null → set). Second run: set → set.
do $$ begin perform torny_rls.rr_retry_upsert(); end $$;
select is(
  torny_rls.rr_retry_upsert(),
  1, 'the organiser''s publish retry writes their own confirmed row again'
);

select throws_ok(
  format($q$update public.users set guest_created_by = %L where id = %L$q$,
         torny_rls.flightmate_id(), torny_rls.active_id()),
  '42501', null,
  'a player cannot write users.guest_created_by on their own row'
);

select torny_rls.as_service();
select is(
  torny_rls.rows_of(format($q$update public.users set guest_created_by = %L where id = %L$q$,
                           torny_rls.active_id(), torny_rls.rr_guest())),
  1, 'the service role writes users.guest_created_by'
);

select * from finish();
rollback;
