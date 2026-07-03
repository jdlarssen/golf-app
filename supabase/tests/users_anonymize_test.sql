-- supabase/tests/users_anonymize_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Integration test: account anonymization (#1012, migration 0131) — the
-- anonymize_user() SECURITY DEFINER function plus the deleted_at extension of
-- guard_users_self_update, end-to-end against real Postgres roles.
--
-- Background: users.id FKs auth.users ON DELETE CASCADE, and NO ACTION FKs
-- (game_players/scores/invitations/games.created_by) block that cascade for
-- anyone who has played — so deletion for played users is anonymization: scrub
-- the users row, delete personal/social rows, KEEP the game history. The
-- deleted_at tombstone gates picker-/mail-exclusions in the app layer and must
-- be unwritable from a hostile self-PATCH.
--
--   GUARD (0131 extension of guard_users_self_update):
--     1. non-admin setting deleted_at on own row → REJECTED (42501)
--     2. (sanity) deleted_at stays null afterwards
--
--   EXECUTE grants:
--     3. authenticated calling anonymize_user() → REJECTED (42501 — the
--        function is service_role-only)
--
--   anonymize_user() as service role:
--     4. name → 'Slettet bruker'
--     5. email → slettet+<uuid>@deleted.tornygolf.no (unique, no-MX)
--     6. deleted_at set, nickname/gender/locale nulled
--     7. friendships deleted (both directions)
--     8. invitations addressed to the old email deleted
--     9. game_players rows PRESERVED (history is the point)
--    10. idempotent — a second call succeeds without error
--    11. admin target → REJECTED (42501 — admin accounts can't be anonymized)
--
-- Runs as the `authenticated` role with a forged JWT `sub` claim — the same
-- runtime path the app uses. See supabase/tests/README.md for how to run.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

\ir fixtures/rls_helpers.psql

-- Seed the shared rig (active game, five players + outsider), then the
-- personal/social rows the anonymization must clean up.
select torny_rls.as_service();
select torny_rls.seed_active_game();

insert into public.friendships (requester_id, addressee_id, status)
  values (torny_rls.active_id(), torny_rls.flightmate_id(), 'accepted');
insert into public.invitations (email, token, invited_by, expires_at)
  values (
    (select email from public.users where id = torny_rls.active_id()),
    'anonymize-test-token',
    torny_rls.admin_id(),
    now() + interval '7 days'
  );

-- ═════════════════════════════════════════════════════════════════════════════
-- GUARD — a non-admin cannot touch their own deleted_at
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.active_id());

select ok(
  not torny_rls.try_set_deleted_at(torny_rls.active_id()),
  'non-admin user is BLOCKED from setting their OWN deleted_at (0131 guard)'
);

select is(
  (select deleted_at from public.users where id = torny_rls.active_id()),
  null::timestamptz,
  'deleted_at stayed null after the hostile self-PATCH'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- EXECUTE — anonymize_user is service_role-only
-- ═════════════════════════════════════════════════════════════════════════════
select throws_ok(
  format('select public.anonymize_user(%L::uuid)', torny_rls.active_id()),
  '42501',
  'permission denied for function anonymize_user',
  'authenticated is DENIED execute on anonymize_user (service_role-only)'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- anonymize_user() — scrub + cleanup + preserved history
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_service();
select public.anonymize_user(torny_rls.active_id());

select is(
  (select name from public.users where id = torny_rls.active_id()),
  'Slettet bruker',
  'name is scrubbed to the literal «Slettet bruker»'
);

select is(
  (select email from public.users where id = torny_rls.active_id()),
  'slettet+' || torny_rls.active_id() || '@deleted.tornygolf.no',
  'email is randomized to the unique no-MX tombstone address'
);

select ok(
  (select deleted_at is not null
      and nickname is null
      and gender is null
      and locale is null
     from public.users where id = torny_rls.active_id()),
  'deleted_at set; nickname/gender/locale nulled'
);

select is(
  (select count(*) from public.friendships
    where requester_id = torny_rls.active_id()
       or addressee_id = torny_rls.active_id()),
  0::bigint,
  'friendships are deleted in both directions'
);

select is(
  (select count(*) from public.invitations where token = 'anonymize-test-token'),
  0::bigint,
  'invitations addressed to the old email are deleted'
);

select is(
  (select count(*) from public.game_players
    where user_id = torny_rls.active_id()),
  1::bigint,
  'game_players rows are PRESERVED (history stays in the tournament)'
);

select lives_ok(
  format('select public.anonymize_user(%L::uuid)', torny_rls.active_id()),
  'a second anonymize_user call is idempotent (retry-safe)'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- Admin accounts can never be anonymized
-- ═════════════════════════════════════════════════════════════════════════════
select throws_ok(
  format('select public.anonymize_user(%L::uuid)', torny_rls.admin_id()),
  '42501',
  'admin accounts cannot be anonymized (public.users.is_admin)',
  'anonymize_user RAISEs on an admin target'
);

select * from finish();
rollback;
