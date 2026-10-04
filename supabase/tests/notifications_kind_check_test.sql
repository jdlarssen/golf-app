-- supabase/tests/notifications_kind_check_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK integration test: notifications.kind (migration 0203, #2268).
--
-- The organiser's «Påminn» on a skipped-hole row writes a notification of kind
-- 'missing_score_reminder'. Before 0203 the CHECK refused it, and `notify`
-- only logged the failure: no inbox row, no push, no mail.
--
--   ALLOWED:
--     1. kind = 'missing_score_reminder'   → lives
--     2. (sanity) the row is there
--     3. kind = 'deliver_reminder'         → lives (the list kept its old kinds)
--   FORBIDDEN:
--     4. kind = 'not_a_kind'               → 23514 (check_violation)
--
-- Inserts run as the service role, the only role that writes notifications
-- (there is no insert policy). The insert and the check are separate
-- statements (#1910). See supabase/tests/README.md for how to run.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

\ir fixtures/rls_helpers.psql

select torny_rls.as_service();
select torny_rls.seed_active_game();

select lives_ok(
  $$ insert into public.notifications (user_id, kind, payload)
     values (torny_rls.active_id(), 'missing_score_reminder',
             jsonb_build_object('game_id', torny_rls.game_id(), 'game_name', 'Testrunden', 'holes', jsonb_build_array(10))) $$,
  'a missing_score_reminder notification can be inserted'
);

select is(
  (select count(*)::int from public.notifications
    where user_id = torny_rls.active_id() and kind = 'missing_score_reminder'),
  1,
  'the missing_score_reminder row is stored'
);

select lives_ok(
  $$ insert into public.notifications (user_id, kind, payload)
     values (torny_rls.active_id(), 'deliver_reminder',
             jsonb_build_object('game_id', torny_rls.game_id(), 'game_name', 'Testrunden')) $$,
  'deliver_reminder is still allowed (the re-added list kept the old kinds)'
);

select throws_ok(
  $$ insert into public.notifications (user_id, kind, payload)
     values (torny_rls.active_id(), 'not_a_kind', '{}'::jsonb) $$,
  '23514',
  null,
  'an unknown kind is refused by notifications_kind_check'
);

select * from finish();

rollback;
