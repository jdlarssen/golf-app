-- supabase/tests/peer_approval_rls_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- RLS / trigger integration test: peer scorecard-approval (#704), end-to-end
-- against real Postgres roles. Verifies migration 0106:
--
--   (1) the new permissive UPDATE policy "game_players peer approve flightmate"
--       (gated on can_score_for) lets a plain same-flight PEER — NOT the game
--       creator, NOT an admin — write a flight-mate's approval columns, and
--   (2) the extended guard_game_players_self_update trigger restricts that peer
--       to ONLY the approval columns on another's row.
--
-- This is the gap the bug exposed: before 0106, a same-flight peer who was
-- neither creator nor admin matched NO UPDATE policy → 0 rows, error == null,
-- false success. So unlike game_players_update_rls_test.sql (which reassigns
-- created_by to make the peer the creator), this suite deliberately keeps
-- created_by = admin_id, so the peer is authorized SOLELY by can_score_for.
--
--   ALLOWED (the fix):
--     1. same-flight peer (non-creator, non-admin) sets approved_at on a
--        flight-mate's row                                  → PASS (the bug fix)
--     2. ... and approved_at was actually written (not a 0-row no-op)
--
--   FORBIDDEN (column-surface hardening — peer touching a non-approval column):
--     3. same-flight peer changes a flight-mate's course_handicap → REJECTED
--     4. same-flight peer changes a flight-mate's team_number     → REJECTED
--
--   FORBIDDEN (flight scope unchanged for >4 games):
--     5. a different-flight player in a 6-player game cannot approve another
--        flight's row                                       → REJECTED (0 rows)
--
--   ALLOWED (paths that must keep working):
--     6. same-flight peer in that 6-player game CAN approve a same-flight row
--     7. admin sets any player's approved_at                → PASS (admin bypass)
--
-- Runs as the `authenticated` role with a forged JWT `sub` claim — the real
-- runtime path — so can_score_for() and the guard trigger execute as in prod.
-- The seeding role (postgres) BYPASSES RLS, so we SET ROLE authenticated before
-- every authenticated probe.
--
-- Run via:  supabase test db   (boots local stack → applies migrations → here)
-- See supabase/tests/README.md (same rig as #440 / #670).
-- NOTE: requires migration 0106 applied.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

\ir fixtures/rls_helpers.psql

-- ─────────────────────────────────────────────────────────────────────────────
-- Local probes + a 6-player split-flight scenario, in the torny_rls schema.
-- ─────────────────────────────────────────────────────────────────────────────

-- try_set_team(target, team): current impersonated user tries to change
-- `target`'s team_number on the MAIN rig's game. Returns whether the row updated.
create or replace function torny_rls.try_set_team(p_target uuid, p_team int) returns boolean
  language plpgsql as $$
declare
  v_rows int;
begin
  update public.game_players
     set team_number = p_team
   where game_id = torny_rls.game_id() and user_id = p_target;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
exception
  when insufficient_privilege then return false;  -- trigger 42501 or RLS reject
end;
$$;

-- Distinct game id for the 6-player split-flight scenario (valid hex only).
create or replace function torny_rls.pa_game_id() returns uuid language sql immutable as $$
  select '00000000-0000-4000-a000-000000000ba0'::uuid
$$;

-- Six deterministic users for the split scenario. lpad to 2 hex digits keeps a
-- well-formed UUID: ...0000ba01 … ...0000ba06.
create or replace function torny_rls.pa_user(n int) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-a000-00000000ba' || lpad(n::text, 2, '0'))::uuid
$$;

create or replace function torny_rls.pa_reset() returns void language plpgsql as $$
begin
  delete from public.scores       where game_id = torny_rls.pa_game_id();
  delete from public.game_players where game_id = torny_rls.pa_game_id();
  delete from public.games        where id      = torny_rls.pa_game_id();
end;
$$;

-- Seed a 6-player ACTIVE strokeplay game with flights 1,1,1 / 2,2,2.
-- created_by = admin_id (NOT any of the six), so no creator-policy shortcut.
create or replace function torny_rls.pa_seed_split_game() returns void language plpgsql as $$
declare
  i int;
begin
  perform torny_rls.pa_reset();

  for i in 1..6 loop
    insert into auth.users (id, instance_id, aud, role, email)
      values (torny_rls.pa_user(i), '00000000-0000-0000-0000-000000000000'::uuid,
              'authenticated', 'authenticated', 'pa-user-' || i || '@example.test')
    on conflict (id) do nothing;
    insert into public.users (id, email, name, is_admin)
      values (torny_rls.pa_user(i), 'pa-user-' || i || '@example.test', 'PA User ' || i, false)
    on conflict (id) do update set email = excluded.email, name = excluded.name, is_admin = excluded.is_admin;
  end loop;

  -- Reuse the main rig's course + tee (seeded by seed_active_game).
  insert into public.games (id, name, course_id, tee_box_id, status, game_mode, created_by, started_at)
    values (torny_rls.pa_game_id(), 'PA Split Game', torny_rls.course_id(),
            torny_rls.tee_box_id(), 'active', 'skins', torny_rls.admin_id(), now());

  -- All six submitted (so there is something to approve); flights 1,1,1 / 2,2,2.
  for i in 1..6 loop
    insert into public.game_players (game_id, user_id, team_number, flight_number, submitted_at, withdrawn_at)
      values (torny_rls.pa_game_id(), torny_rls.pa_user(i), null,
              case when i <= 3 then 1 else 2 end, now(), null);
  end loop;
end;
$$;

-- try_approve_in(game, target): current impersonated user stamps approved_at +
-- approved_by_user_id on `target`'s row in an arbitrary game. Returns whether the
-- row updated (false on a trigger/RLS reject or a 0-row filter).
create or replace function torny_rls.try_approve_in(p_game uuid, p_target uuid) returns boolean
  language plpgsql as $$
declare
  v_actor uuid := nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub';
  v_rows  int;
begin
  update public.game_players
     set approved_at = now(), approved_by_user_id = coalesce(v_actor, p_target)
   where game_id = p_game and user_id = p_target;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
exception
  when insufficient_privilege then return false;
end;
$$;

grant execute on all functions in schema torny_rls to authenticated, anon, service_role;

-- ── Seed: ACTIVE single-flight game (4 active players, created_by admin) ──────
-- seed_active_game seeds admin_id/active_id/flightmate_id/submitted_id active in
-- flight 1 (withdrawn_id is withdrawn). 4 active ≤ 4 → single-flight game, so
-- can_score_for() relates every active player to every other.
select torny_rls.as_service();
select torny_rls.seed_active_game();

-- ═════════════════════════════════════════════════════════════════════════════
-- 1 + 2. THE FIX — a plain same-flight peer (non-creator, non-admin) CAN approve
-- ═════════════════════════════════════════════════════════════════════════════
-- flightmate_id approves active_id's card. flightmate_id is NOT the game creator
-- (admin_id is) and is NOT an admin → before 0106 this matched no UPDATE policy
-- and silently affected 0 rows. The new can_score_for policy must now allow it.
select torny_rls.as_user(torny_rls.flightmate_id());
select ok(
  torny_rls.try_self_approve(torny_rls.active_id()),
  'same-flight peer (non-creator, non-admin) CAN approve a flight-mate''s row (#704 fix)'
);
select isnt(
  (select approved_at from public.game_players
     where game_id = torny_rls.game_id() and user_id = torny_rls.active_id()),
  null,
  'peer-approval actually wrote approved_at (not a 0-row no-op)'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- 3 + 4. COLUMN SURFACE — a peer may NOT change non-approval columns
-- ═════════════════════════════════════════════════════════════════════════════
-- The can_score_for policy opens the whole row, so the guard trigger must keep a
-- peer from editing a flight-mate's handicap (cheat) or team_number. We probe
-- against submitted_id (another active flight-1 player), still as flightmate_id.
select ok(
  not torny_rls.try_set_handicap(torny_rls.submitted_id(), 1),
  'same-flight peer is BLOCKED from changing a flight-mate''s course_handicap'
);
select ok(
  not torny_rls.try_set_team(torny_rls.submitted_id(), 3),
  'same-flight peer is BLOCKED from changing a flight-mate''s team_number'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- 5 + 6. FLIGHT SCOPE — different-flight DENIED, same-flight ALLOWED (>4 game)
-- ═════════════════════════════════════════════════════════════════════════════
-- 6-player game, flights 1,1,1 / 2,2,2 → can_score_for's single-flight branch
-- does NOT fire; only same-flight is allowed.
select torny_rls.as_service();
select torny_rls.pa_seed_split_game();

-- A flight-2 player tries to approve a flight-1 player's row → DENIED (0 rows).
select torny_rls.as_user(torny_rls.pa_user(4));   -- flight 2
select ok(
  not torny_rls.try_approve_in(torny_rls.pa_game_id(), torny_rls.pa_user(1)),  -- flight 1 target
  'cross-flight player (>4 game) CANNOT approve another flight''s row (scope unchanged)'
);

-- A flight-1 peer approves another flight-1 player's row → ALLOWED.
select torny_rls.as_user(torny_rls.pa_user(2));   -- flight 1
select ok(
  torny_rls.try_approve_in(torny_rls.pa_game_id(), torny_rls.pa_user(1)),  -- flight 1 target
  'same-flight peer in a >4 game (flights assigned) CAN approve a same-flight row'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- 7. ADMIN PATH UNCHANGED — admin approves any row (trigger no-ops on is_admin)
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.admin_id());
select ok(
  torny_rls.try_approve_in(torny_rls.pa_game_id(), torny_rls.pa_user(4)),  -- different flight
  'admin CAN approve any player''s row (admin bypass unaffected by #704)'
);

-- Cleanup.
select torny_rls.as_service();
select torny_rls.pa_reset();

select * from finish();
rollback;
