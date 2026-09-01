-- supabase/tests/game_players_creator_self_group_rls_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- RLS / trigger integration test for migration 0168 (#1855 / #1868): the game's
-- CREATOR may set team_number/flight_number on their OWN row.
--
-- Why the escape exists: `startScheduledGameCore` draws Wolf / Round Robin
-- rotation slots (#969) for every ACTIVE player — the organiser included. Under
-- RLS (the native app, which never has service-role) guard (b) of
-- `guard_game_players_self_update` refused exactly that one row, so a non-admin
-- organiser who also plays could not start those two formats at all. Caught on
-- staging 2026-09-01 with a live 42501 on the organiser's slot write.
--
-- What this suite pins:
--   NEW (0168):
--     1. non-admin CREATOR sets own team_number      → PASS
--     2. non-admin CREATOR sets own flight_number    → PASS
--   UNCHANGED (the escape must stay keyed on created_by):
--     3. non-admin NON-creator sets own team_number  → REJECTED
--     4. non-admin NON-creator sets own flight_number→ REJECTED
--     5. CREATOR sets ANOTHER player's team_number   → PASS  (0107/0147, unchanged)
--   The other own-row guards must NOT have moved (trap 4 — 0168 rebuilt the
--   whole body, so every sibling guard needs a live assert, not an eyeball):
--     6. CREATOR clears own withdrawn_at             → REJECTED (guard c)
--     7. CREATOR sets own approved_at                → REJECTED (guard a, set-direction)
--     8. CREATOR clears own approval                 → PASS  (guard a, #1362 reopen)
--     9. non-creator clears own approval             → REJECTED (#1362 is creator-only)
--
-- Asserts 8–9 exist because the first draft of 0168 copied 0147's body — 0147
-- says "copy from the LATEST create-or-replace", but 0147 is NOT the latest:
-- 0159 (#1362) is. That draft silently reverted the reopen exception and reached
-- staging. Guard (a) had a set-direction assert but no clear-direction one, so
-- nothing caught it. These two close that hole in both directions.
--
-- The seeded game is created by admin_id(), whose is_admin() escape fires before
-- the own-row branch and would mask everything. Every probe below therefore
-- re-points games.created_by at a NON-admin actor first — that is the whole
-- point of the suite.
--
-- Run via:  supabase test db
-- See supabase/tests/README.md (same rig as #440).
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

\ir fixtures/rls_helpers.psql

-- ── Probe helpers ────────────────────────────────────────────────────────────
-- Each returns TRUE when the write landed, FALSE when the guard (42501) or RLS
-- refused it. `get diagnostics` is what separates "refused" from "0 rows" —
-- felle 2 in test form.
create or replace function torny_rls.try_set_team(p_target uuid, p_team int)
  returns boolean language plpgsql as $$
  declare v_rows int;
  begin
    update public.game_players
       set team_number = p_team
     where game_id = torny_rls.game_id() and user_id = p_target;
    get diagnostics v_rows = row_count;
    return v_rows > 0;
  exception when insufficient_privilege then return false;
  end;
  $$;

create or replace function torny_rls.try_set_flight(p_target uuid, p_flight int)
  returns boolean language plpgsql as $$
  declare v_rows int;
  begin
    update public.game_players
       set flight_number = p_flight
     where game_id = torny_rls.game_id() and user_id = p_target;
    get diagnostics v_rows = row_count;
    return v_rows > 0;
  exception when insufficient_privilege then return false;
  end;
  $$;

create or replace function torny_rls.try_clear_withdrawn(p_target uuid)
  returns boolean language plpgsql as $$
  declare v_rows int;
  begin
    update public.game_players
       set withdrawn_at = null, withdrawn_by_user_id = null
     where game_id = torny_rls.game_id() and user_id = p_target;
    get diagnostics v_rows = row_count;
    return v_rows > 0;
  exception when insufficient_privilege then return false;
  end;
  $$;

create or replace function torny_rls.try_self_approve(p_target uuid)
  returns boolean language plpgsql as $$
  declare v_rows int;
  begin
    update public.game_players
       set approved_at = now(), approved_by_user_id = p_target
     where game_id = torny_rls.game_id() and user_id = p_target;
    get diagnostics v_rows = row_count;
    return v_rows > 0;
  exception when insufficient_privilege then return false;
  end;
  $$;

create or replace function torny_rls.try_clear_approval_row(p_target uuid)
  returns boolean language plpgsql as $$
  declare v_rows int;
  begin
    update public.game_players
       set approved_at = null, approved_by_user_id = null
     where game_id = torny_rls.game_id() and user_id = p_target;
    get diagnostics v_rows = row_count;
    return v_rows > 0;
  exception when insufficient_privilege then return false;
  end;
  $$;

select torny_rls.reset();
select torny_rls.seed_active_game();

-- active_id() becomes the (non-admin) creator for the whole suite.
select torny_rls.as_service();
update public.games set created_by = torny_rls.active_id()
 where id = torny_rls.game_id();

-- ── 1–2. The creator may group THEMSELVES (0168) ─────────────────────────────
select torny_rls.as_user(torny_rls.active_id());
select ok(
  torny_rls.try_set_team(torny_rls.active_id(), 3),
  'creator (non-admin) may set team_number on their OWN row (0168 / #1855)'
);
select ok(
  torny_rls.try_set_flight(torny_rls.active_id(), 3),
  'creator (non-admin) may set flight_number on their OWN row (0168 / #1855)'
);

-- ── 3–4. A plain player still may not (the escape is keyed on created_by) ────
select torny_rls.as_user(torny_rls.flightmate_id());
select ok(
  NOT torny_rls.try_set_team(torny_rls.flightmate_id(), 2),
  'non-creator player still may NOT set own team_number (0107 guard stands)'
);
select ok(
  NOT torny_rls.try_set_flight(torny_rls.flightmate_id(), 2),
  'non-creator player still may NOT set own flight_number (0107 guard stands)'
);

-- ── 5. The creator keeps full roster access on other rows ────────────────────
select torny_rls.as_user(torny_rls.active_id());
select ok(
  torny_rls.try_set_team(torny_rls.flightmate_id(), 4),
  'creator may still set ANOTHER player''s team_number (0147 other-row bypass)'
);

-- ── 6–7. Sibling own-row guards must be untouched by 0168's rebuild ──────────
-- withdrawn_id() is a different row, so first make the creator the withdrawn
-- one: guard (c) is about YOUR OWN withdrawal, and that is what must stay shut.
select torny_rls.as_service();
update public.game_players
   set withdrawn_at = now(), withdrawn_by_user_id = torny_rls.admin_id()
 where game_id = torny_rls.game_id() and user_id = torny_rls.active_id();

select torny_rls.as_user(torny_rls.active_id());
select ok(
  NOT torny_rls.try_clear_withdrawn(torny_rls.active_id()),
  'creator still may NOT clear their own withdrawn_at (guard c, #802, untouched)'
);
select ok(
  NOT torny_rls.try_self_approve(torny_rls.active_id()),
  'creator still may NOT approve their own scorecard (guard a, #670, untouched)'
);

-- ── 8–9. #1362's reopen exception must survive 0168's rebuild ────────────────
-- The regression that motivated these: guard (a) is asymmetric — SETTING your
-- own approval is forbidden for everyone, CLEARING it is allowed for the
-- creator only. A body copied from the wrong base keeps the first half and
-- loses the second, and assert 7 alone stays green.
select torny_rls.as_service();
update public.game_players
   set approved_at = now(), approved_by_user_id = torny_rls.admin_id()
 where game_id = torny_rls.game_id()
   and user_id in (torny_rls.active_id(), torny_rls.flightmate_id());

select torny_rls.as_user(torny_rls.active_id());
select ok(
  torny_rls.try_clear_approval_row(torny_rls.active_id()),
  'creator may CLEAR their own approval — reopen own scorecard (0159 / #1362)'
);

select torny_rls.as_user(torny_rls.flightmate_id());
select ok(
  NOT torny_rls.try_clear_approval_row(torny_rls.flightmate_id()),
  'non-creator may NOT clear their own approval (#1362 is creator-only)'
);

select * from finish();
rollback;
