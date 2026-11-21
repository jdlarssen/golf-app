-- supabase/tests/users_anonymize_mentions_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Integration test: account deletion removes the person from OTHER people's
-- rows (migration 0253, scrub_user_mentions).
--
-- anonymize_user scrubs the users row and deletes the person's own rows. The
-- name was also stored as text in rows that belong to someone else. This suite
-- seeds one of each and runs both deletion paths:
--
--   anonymize_user (an account with game history):
--     1. a name key with an id next to it is replaced, matched on the id
--        (the stored name is an older one)
--     2. a name key without an id is replaced, matched on the text
--        (name + «nickname»)
--     3. a nickname-only value is replaced
--     4. the sign-up message goes with the name
--     5. a namesake with ANOTHER id next to the name is left alone
--     6. another person who shares the last name is left alone
--     7. game_name is never touched, also when it holds the person's name
--     8. the first name leaves the organiser's evening status and is counted
--     9. the round report that names the person is removed
--    10. its first lines leave the «round finished» notice
--    11. a round report that does not name the person stays
--    12. the name snapshot in the audit log is replaced
--    13. another player's Kavalkade that holds the person is deleted
--    14. a Kavalkade that does not hold the person stays
--    15. the invitations the account sent are deleted
--    16. the recipient's own notifications about someone else are unchanged
--    17. a second call is a no-op and does not raise
--
--   hard delete (auth.users cascade, an account that never played):
--    18. the delete succeeds
--    19. the name is replaced in other people's notifications
--
--   EXECUTE:
--    20. authenticated cannot call scrub_user_mentions
--
-- See supabase/tests/README.md for how to run.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(20);

\ir fixtures/rls_helpers.psql

select torny_rls.as_service();
select torny_rls.seed_active_game();

-- The person who deletes the account: «Petter Åttesen», nickname «Åtta».
update public.users set name = 'Petter Åttesen', nickname = 'Åtta'
 where id = torny_rls.active_id();
-- The hard-delete person: never on a roster.
update public.users set name = 'Hanna Hardslett'
 where id = torny_rls.outsider_id();

-- A second round the person did NOT play, with its own report.
insert into public.games (id, name, course_id, tee_box_id, status, game_mode, created_by, started_at, round_report)
  values ('00000000-0000-4000-a000-0000000000a9', 'Other round', torny_rls.course_id(),
          torny_rls.tee_box_id(), 'active', 'solo_strokeplay', torny_rls.admin_id(), now(),
          'Petter Åttesen var ikke med her.');
update public.games
   set round_report = 'Petter Åttesen åpnet med birdie. «Åtta» holdt unna til slutt.'
 where id = torny_rls.game_id();

-- Notifications in the flight-mate's inbox. `tag` names the row for the asserts.
insert into public.notifications (user_id, kind, payload) values
  (torny_rls.flightmate_id(), 'scorecard_submitted', jsonb_build_object(
     'tag', 'by-id', 'game_id', torny_rls.game_id(), 'game_name', 'G',
     'player_name', 'Et Eldre Navn', 'player_id', torny_rls.active_id())),
  (torny_rls.flightmate_id(), 'invite', jsonb_build_object(
     'tag', 'by-text', 'game_id', torny_rls.game_id(), 'game_name', 'G',
     'invited_by_name', 'Petter Åttesen «Åtta»')),
  (torny_rls.flightmate_id(), 'player_added', jsonb_build_object(
     'tag', 'nickname', 'game_id', torny_rls.game_id(), 'game_name', 'G',
     'added_by_name', 'Åtta')),
  (torny_rls.flightmate_id(), 'registration_request', jsonb_build_object(
     'tag', 'message', 'game_id', torny_rls.game_id(), 'game_name', 'G',
     'requester_name', 'Petter Åttesen', 'message', 'Hilsen Petter')),
  (torny_rls.flightmate_id(), 'scorecard_submitted', jsonb_build_object(
     'tag', 'namesake', 'game_id', torny_rls.game_id(), 'game_name', 'G',
     'player_name', 'Petter Åttesen', 'player_id', torny_rls.submitted_id())),
  (torny_rls.flightmate_id(), 'scorecard_approved', jsonb_build_object(
     'tag', 'relative', 'game_id', torny_rls.game_id(), 'game_name', 'Petter Åttesen Open',
     'approver_name', 'Kari Åttesen')),
  (torny_rls.flightmate_id(), 'organizer_evening_status', jsonb_build_object(
     'tag', 'evening', 'game_id', torny_rls.game_id(), 'game_name', 'G',
     'tee_off_at', now(), 'confirmed', 1, 'total', 3,
     'unanswered_names', jsonb_build_array('Petter', 'Kari'), 'unanswered_more', 0)),
  (torny_rls.flightmate_id(), 'game_finished', jsonb_build_object(
     'tag', 'report-start', 'game_id', torny_rls.game_id(), 'game_name', 'G',
     'report_start', 'Petter Åttesen åpnet med birdie.')),
  (torny_rls.flightmate_id(), 'club_join_request', jsonb_build_object(
     'tag', 'hard', 'group_id', torny_rls.group_id(), 'group_name', 'K',
     'requester_name', 'Hanna Hardslett'));

insert into public.admin_audit_log (actor_user_id, actor_name, event_type, target_type, target_id, payload)
  values (torny_rls.active_id(), 'Petter Åttesen', 'game.reopened', 'game', torny_rls.game_id(), '{}'::jsonb);

insert into public.kavalkades (user_id, year, facts, narrative) values
  (torny_rls.flightmate_id(), 2026,
   jsonb_build_object('rival', jsonb_build_object('userId', torny_rls.active_id(), 'name', 'Petter Å.')),
   'Du og Petter møttes fem ganger.'),
  (torny_rls.submitted_id(), 2026, '{"rounds": 3}'::jsonb, 'Et golfår.');

insert into public.invitations (email, token, invited_by, expires_at) values
  ('mentions-sent@example.test', 'mentions-test-sent', torny_rls.active_id(), now() + interval '7 days');

create temporary table mentions_before as
  select id, payload from public.notifications
   where user_id = torny_rls.flightmate_id() and payload->>'tag' in ('namesake', 'relative');
grant select on mentions_before to public;

create or replace function pg_temp.note(p_tag text) returns jsonb
  language sql stable as $$
    select payload from public.notifications
     where user_id = torny_rls.flightmate_id() and payload->>'tag' = p_tag
  $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- anonymize_user
-- ═════════════════════════════════════════════════════════════════════════════
select public.anonymize_user(torny_rls.active_id());

select is(pg_temp.note('by-id')->>'player_name', 'Slettet bruker',
  'a name with the person''s id next to it is replaced, whatever the stored text');

select is(pg_temp.note('by-text')->>'invited_by_name', 'Slettet bruker',
  'a name without an id is replaced when the text is the person (name + «nickname»)');

select is(pg_temp.note('nickname')->>'added_by_name', 'Slettet bruker',
  'a value that is only the nickname is replaced');

select ok(
  pg_temp.note('message')->>'requester_name' = 'Slettet bruker'
    and not pg_temp.note('message') ? 'message',
  'the sign-up notice loses the name and the person''s message');

select is(pg_temp.note('namesake')->>'player_name', 'Petter Åttesen',
  'the same name with ANOTHER id next to it is someone else and stays');

select is(pg_temp.note('relative')->>'approver_name', 'Kari Åttesen',
  'another person with the same last name stays');

select is(pg_temp.note('relative')->>'game_name', 'Petter Åttesen Open',
  'game_name is not a person key and stays, also when it holds the name');

select ok(
  pg_temp.note('evening')->'unanswered_names' = '["Kari"]'::jsonb
    and (pg_temp.note('evening')->>'unanswered_more')::int = 1,
  'the first name leaves the evening status and is counted in unanswered_more');

select is(
  (select round_report from public.games where id = torny_rls.game_id()),
  null,
  'the round report that names the person is removed');

select ok(
  not pg_temp.note('report-start') ? 'report_start',
  'the first lines of that report leave the «round finished» notice');

select is(
  (select round_report from public.games where id = '00000000-0000-4000-a000-0000000000a9'),
  'Petter Åttesen var ikke med her.',
  'the report of a round the person did not play is not searched');

select is(
  (select actor_name from public.admin_audit_log where actor_user_id = torny_rls.active_id()),
  'Slettet bruker',
  'the name snapshot in the audit log is replaced');

select is(
  (select count(*) from public.kavalkades where user_id = torny_rls.flightmate_id()),
  0::bigint,
  'another player''s Kavalkade that holds the person is deleted (it is rebuilt on next opening)');

select is(
  (select count(*) from public.kavalkades where user_id = torny_rls.submitted_id()),
  1::bigint,
  'a Kavalkade that does not hold the person stays');

select is(
  (select count(*) from public.invitations where invited_by = torny_rls.active_id()),
  0::bigint,
  'the invitations the account sent are deleted');

select is(
  (select count(*) from mentions_before b
     join public.notifications n on n.id = b.id and n.payload = b.payload),
  2::bigint,
  'notices about other people are byte-for-byte unchanged');

select lives_ok(
  format('select public.anonymize_user(%L::uuid)', torny_rls.active_id()),
  'a second call does not raise');

-- ═════════════════════════════════════════════════════════════════════════════
-- Hard delete — the auth.users cascade fires the trigger
-- ═════════════════════════════════════════════════════════════════════════════
select lives_ok(
  format('delete from auth.users where id = %L::uuid', torny_rls.outsider_id()),
  'an account that never played still hard-deletes');

select is(pg_temp.note('hard')->>'requester_name', 'Slettet bruker',
  'the hard-delete path replaces the name in other people''s notifications too');

-- ═════════════════════════════════════════════════════════════════════════════
-- EXECUTE
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.flightmate_id());

select throws_ok(
  format('select public.scrub_user_mentions(%L::uuid, %L, null, null)',
         torny_rls.submitted_id(), 'RLS Submitted'),
  '42501', null,
  'authenticated is DENIED execute on scrub_user_mentions');

select * from finish();
rollback;
