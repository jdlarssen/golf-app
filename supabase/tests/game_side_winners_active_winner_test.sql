-- supabase/tests/game_side_winners_active_winner_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger integration test for migration 0193 (#2284): a side-tournament
-- winner must be an active player in the game.
--
-- What this suite pins:
--   1. an active player                         → saved
--   2. a withdrawn player                       → REJECTED (P0001 side_winner_not_active)
--   3. a user who is not in the game            → REJECTED
--   4. winner_user_id = null («Ingen kvalifiserte») → saved
--   5. an upsert conflict that rewrites a saved row to a withdrawn player → REJECTED
--   6. … and the saved row keeps its active winner
--   7. one bad row in a batch                   → the whole statement is rejected
--   8. … and none of the batch's rows land
--   9. the same refusal through the signed-in (JWT) path, not just the service role
--  10. the trigger function is not callable over /rest/v1/rpc
--
-- Run via:  supabase test db
-- See supabase/tests/README.md (same rig as #440).
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

\ir fixtures/rls_helpers.psql

select torny_rls.as_service();
select torny_rls.seed_active_game();

-- ── 1. An active player is saved ─────────────────────────────────────────────
select lives_ok(
  format(
    $sql$insert into public.game_side_winners (game_id, category, position, winner_user_id)
         values (%L, 'longest_drive', 1, %L)$sql$,
    torny_rls.game_id(), torny_rls.active_id()
  ),
  '#2284: an active player can be saved as a side-tournament winner'
);

-- ── 2. A withdrawn player is rejected ────────────────────────────────────────
select throws_ok(
  format(
    $sql$insert into public.game_side_winners (game_id, category, position, winner_user_id)
         values (%L, 'longest_drive', 2, %L)$sql$,
    torny_rls.game_id(), torny_rls.withdrawn_id()
  ),
  'P0001',
  'side_winner_not_active',
  '#2284: a withdrawn player cannot be saved as a side-tournament winner'
);

-- ── 3. Someone outside the game is rejected ──────────────────────────────────
select throws_ok(
  format(
    $sql$insert into public.game_side_winners (game_id, category, position, winner_user_id)
         values (%L, 'closest_to_pin', 1, %L)$sql$,
    torny_rls.game_id(), torny_rls.outsider_id()
  ),
  'P0001',
  'side_winner_not_active',
  '#2284: a user who is not in the game cannot be saved as a side-tournament winner'
);

-- ── 4. «Ingen kvalifiserte» passes ───────────────────────────────────────────
select lives_ok(
  format(
    $sql$insert into public.game_side_winners (game_id, category, position, winner_user_id)
         values (%L, 'closest_to_pin', 2, null)$sql$,
    torny_rls.game_id()
  ),
  '#2284: winner_user_id = null («Ingen kvalifiserte») is saved'
);

-- ── 5–6. The upsert conflict branch (BEFORE UPDATE) ──────────────────────────
-- The shape both clients send: on conflict (game_id, category, position).
select throws_ok(
  format(
    $sql$insert into public.game_side_winners (game_id, category, position, winner_user_id)
         values (%L, 'longest_drive', 1, %L)
         on conflict (game_id, category, position)
         do update set winner_user_id = excluded.winner_user_id$sql$,
    torny_rls.game_id(), torny_rls.withdrawn_id()
  ),
  'P0001',
  'side_winner_not_active',
  '#2284: an upsert cannot rewrite a saved winner to a withdrawn player'
);

select is(
  (select winner_user_id from public.game_side_winners
    where game_id = torny_rls.game_id() and category = 'longest_drive' and position = 1),
  torny_rls.active_id(),
  '#2284: the rejected upsert leaves the saved winner as it was'
);

-- ── 7–8. One bad row rejects the whole batch ─────────────────────────────────
delete from public.game_side_winners where game_id = torny_rls.game_id();

select throws_ok(
  format(
    $sql$insert into public.game_side_winners (game_id, category, position, winner_user_id)
         values (%L, 'longest_drive', 1, %L), (%L, 'longest_drive', 2, %L)
         on conflict (game_id, category, position)
         do update set winner_user_id = excluded.winner_user_id$sql$,
    torny_rls.game_id(), torny_rls.active_id(),
    torny_rls.game_id(), torny_rls.withdrawn_id()
  ),
  'P0001',
  'side_winner_not_active',
  '#2284: a batch with one withdrawn winner is rejected as a whole'
);

select is(
  (select count(*)::int from public.game_side_winners where game_id = torny_rls.game_id()),
  0,
  '#2284: none of the rejected batch''s rows land'
);

-- ── 9. The signed-in path ────────────────────────────────────────────────────
-- The fixture's creator is also a global admin, so RLS lets the insert through
-- and the trigger is the only thing that can say no.
select torny_rls.as_user(torny_rls.admin_id());

select throws_ok(
  format(
    $sql$insert into public.game_side_winners (game_id, category, position, winner_user_id)
         values (%L, 'longest_drive', 1, %L)$sql$,
    torny_rls.game_id(), torny_rls.withdrawn_id()
  ),
  'P0001',
  'side_winner_not_active',
  '#2284: the refusal holds for a signed-in organiser, not just the service role'
);

select torny_rls.as_service();

-- ── 10. No RPC surface ───────────────────────────────────────────────────────
select ok(
  not has_function_privilege(
    'authenticated',
    'public.game_side_winners_active_winner_guard()',
    'execute'
  ),
  '#2284: authenticated cannot call the trigger function directly'
);

select * from finish();

rollback;
