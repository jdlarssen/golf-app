-- supabase/tests/handicap_history_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- RLS / trigger integration test: handicap history (#2256, migration 0195).
--
-- The history is written only by the database: an AFTER trigger on
-- public.users records hcp_index when it changes on a finished profile (and
-- when a profile is finished). Clients may read their own rows and nothing
-- else; no client can write the table.
--
--   Trigger:
--     1. finishing a profile records its handicap
--     2. a player changing their own handicap (direct PATCH) records it
--     3. a change to another column records nothing
--     4. saving the same handicap again records nothing
--     5. an unfinished profile (default 54) records nothing
--     6. a player switching their own profile_completed_at off and on again
--        (direct PATCH) records nothing: the value equals the last row
--
--   RLS (as the `authenticated` role):
--     7. a player reads their own rows
--     8. another player reads none of them
--     9. a player cannot insert a row, not even their own
--    10. a player cannot change a row
--    11. a player cannot delete a row
--
--   Account deletion:
--    12. anonymize_user leaves no history for the account
--    13. a deleted account whose handicap changes afterwards records nothing
--
-- Runs as the `authenticated` role with a forged JWT `sub` claim — the same
-- runtime path the app uses. See supabase/tests/README.md for how to run.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

\ir fixtures/rls_helpers.psql

select torny_rls.as_service();
select torny_rls.seed_active_game();

-- 1. Finishing the profile records the handicap it was finished with.
update public.users
   set hcp_index = 14.2, profile_completed_at = now()
 where id = torny_rls.active_id();

select results_eq(
  $$ select hcp_index from public.handicap_history
      where user_id = torny_rls.active_id() order by id $$,
  $$ values (14.2::numeric(4,1)) $$,
  'finishing a profile records its handicap'
);

-- 2. The player changes their own handicap, as the profile form does.
select torny_rls.as_user(torny_rls.active_id());
update public.users set hcp_index = 12.0 where id = torny_rls.active_id();

select torny_rls.as_service();
select results_eq(
  $$ select hcp_index from public.handicap_history
      where user_id = torny_rls.active_id() order by id $$,
  $$ values (14.2::numeric(4,1)), (12.0::numeric(4,1)) $$,
  'a player changing their own handicap records it'
);

-- 3. Another column changes: nothing new.
select torny_rls.as_user(torny_rls.active_id());
update public.users set name = 'RLS Aktiv Omdøpt' where id = torny_rls.active_id();

select torny_rls.as_service();
select is(
  (select count(*)::int from public.handicap_history where user_id = torny_rls.active_id()),
  2,
  'a change to another column records nothing'
);

-- 4. The same handicap saved again: nothing new.
select torny_rls.as_user(torny_rls.active_id());
update public.users set hcp_index = 12.0 where id = torny_rls.active_id();

select torny_rls.as_service();
select is(
  (select count(*)::int from public.handicap_history where user_id = torny_rls.active_id()),
  2,
  'saving the same handicap again records nothing'
);

-- 5. An unfinished profile still holds the sign-up default: no history.
update public.users set hcp_index = 36.0 where id = torny_rls.outsider_id();

select is(
  (select count(*)::int from public.handicap_history where user_id = torny_rls.outsider_id()),
  0,
  'an unfinished profile records nothing'
);

-- 6. Switching profile_completed_at off and on again: the handicap is the
--    same as the last row, so nothing new.
select torny_rls.as_user(torny_rls.active_id());
update public.users set profile_completed_at = null where id = torny_rls.active_id();
update public.users set profile_completed_at = now() where id = torny_rls.active_id();

select torny_rls.as_service();
select is(
  (select count(*)::int from public.handicap_history where user_id = torny_rls.active_id()),
  2,
  'switching profile_completed_at off and on records nothing'
);

-- 7. The player reads their own history.
select torny_rls.as_user(torny_rls.active_id());
select is(
  (select count(*)::int from public.handicap_history where user_id = torny_rls.active_id()),
  2,
  'a player reads their own rows'
);

-- 8. A flightmate reads none of it.
select torny_rls.as_user(torny_rls.flightmate_id());
select is(
  (select count(*)::int from public.handicap_history where user_id = torny_rls.active_id()),
  0,
  'another player reads none of the rows'
);

-- 9.–11. No client writes: insert, update and delete are refused.
select torny_rls.as_user(torny_rls.active_id());
select throws_ok(
  $$ insert into public.handicap_history (user_id, hcp_index)
     values (torny_rls.active_id(), 1.0) $$,
  '42501',
  null,
  'a player cannot insert a row, not even their own'
);

select throws_ok(
  $$ update public.handicap_history set hcp_index = 1.0
      where user_id = torny_rls.active_id() $$,
  '42501',
  null,
  'a player cannot change a row'
);

select throws_ok(
  $$ delete from public.handicap_history where user_id = torny_rls.active_id() $$,
  '42501',
  null,
  'a player cannot delete a row'
);

-- 12. Deleting the account removes the history.
select torny_rls.as_service();
select public.anonymize_user(torny_rls.active_id());

select is(
  (select count(*)::int from public.handicap_history where user_id = torny_rls.active_id()),
  0,
  'anonymize_user leaves no history for the account'
);

-- 13. The account is deleted (deleted_at set): a later handicap change, as
--     the scrub to 54 does, records nothing.
update public.users set hcp_index = 30.0 where id = torny_rls.active_id();

select is(
  (select count(*)::int from public.handicap_history where user_id = torny_rls.active_id()),
  0,
  'a deleted account whose handicap changes records nothing'
);

select * from finish();

rollback;
