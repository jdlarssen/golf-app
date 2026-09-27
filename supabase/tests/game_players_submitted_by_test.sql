-- supabase/tests/game_players_submitted_by_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- RLS / trigger integration test for migration 0191 (#2200): who delivered a
-- scorecard, and that the one who delivered it may not approve it.
--
-- The one who keeps score can deliver the flightmates' cards with their own.
-- `submitted_by_user_id` records who did it, and the trigger
-- `game_players_set_submitted_by` owns the column for every signed-in caller,
-- so it cannot be forged. `can_score_for` (0106 policy) is still the rule for
-- who may deliver another player's card; 0191 widens nothing there.
--
-- What this suite pins:
--   Who delivered:
--     1. own delivery                         → own id
--     2. a flightmate delivers my card        → the flightmate's id
--     3. the card is reopened                 → null
--     4. a forged value on delivery           → auth.uid() wins
--     5. a forged value on a delivered card   → the old value stays
--     6. the service role                     → keeps the value it wrote
--   Approval (owner's decision 2026-09-27):
--     7. the one who delivered approves       → REJECTED
--     8. another flightmate approves          → PASS
--   Hostile requests (#440):
--     9. a peer changes another column        → REJECTED
--    10. someone outside the game delivers    → 0 rows
--    11. someone in another flight delivers   → 0 rows
--   Approval, end state:
--    12. a peer approves an open card         → REJECTED
--    13. a forged approver is overwritten     → auth.uid() wins
--   Insert:
--    14. a forged value on insert             → auth.uid() wins
--   Approval on an open card:
--    15. a peer un-delivers an approved card  → REJECTED
--    16. the owner un-delivers their own approved card → REJECTED (clause f)
--   Approver, game and insert:
--    17. the service role                     → keeps the approver it wrote
--    18. a row moved to another game          → REJECTED
--    19. inserting an already approved row    → REJECTED
--    20. inserting a plain row                → PASS (the path «add player» uses)
--    21. a row moved to another player        → REJECTED, creator included
--
-- Run via:  supabase test db
-- See supabase/tests/README.md (same rig as #440).
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(21);

\ir fixtures/rls_helpers.psql

-- ── Probe helpers ────────────────────────────────────────────────────────────
-- Each returns TRUE when the write landed, FALSE when the guard (42501) or RLS
-- refused it (RLS refusing = 0 rows, read with `get diagnostics` — felle 2 in
-- test form). Both count as refused here; the fixture keeps every actor that
-- is meant to pass RLS in the same flight, so a FALSE on those is the guard.

-- Deliver like the server does: submitted_at and submitted_by_user_id in one
-- patch. `p_by` defaults to the caller; pass another id to forge it.
create or replace function torny_rls.try_deliver(p_target uuid, p_by uuid default null)
  returns boolean language plpgsql as $$
  declare v_rows int;
  begin
    update public.game_players
       set submitted_at = now(),
           submitted_by_user_id = coalesce(p_by, auth.uid()),
           rejection_reason = null
     where game_id = torny_rls.game_id() and user_id = p_target
       and submitted_at is null;
    get diagnostics v_rows = row_count;
    return v_rows > 0;
  exception when insufficient_privilege then return false;
  end;
  $$;

create or replace function torny_rls.try_set_submitted_by(p_target uuid, p_by uuid)
  returns boolean language plpgsql as $$
  declare v_rows int;
  begin
    update public.game_players
       set submitted_by_user_id = p_by
     where game_id = torny_rls.game_id() and user_id = p_target;
    get diagnostics v_rows = row_count;
    return v_rows > 0;
  exception when insufficient_privilege then return false;
  end;
  $$;

create or replace function torny_rls.try_approve(p_target uuid)
  returns boolean language plpgsql as $$
  declare v_rows int;
  begin
    update public.game_players
       set approved_at = now(), approved_by_user_id = auth.uid(), rejection_reason = null
     where game_id = torny_rls.game_id() and user_id = p_target
       and submitted_at is not null and approved_at is null;
    get diagnostics v_rows = row_count;
    return v_rows > 0;
  exception when insufficient_privilege then return false;
  end;
  $$;

create or replace function torny_rls.try_set_paid(p_target uuid)
  returns boolean language plpgsql as $$
  declare v_rows int;
  begin
    update public.game_players
       set paid_at = now()
     where game_id = torny_rls.game_id() and user_id = p_target;
    get diagnostics v_rows = row_count;
    return v_rows > 0;
  exception when insufficient_privilege then return false;
  end;
  $$;

-- Approve with any approver id and no «is it delivered» filter: the hostile
-- shapes the end-state rule has to catch.
create or replace function torny_rls.try_set_approval(p_target uuid, p_by uuid)
  returns boolean language plpgsql as $$
  declare v_rows int;
  begin
    update public.game_players
       set approved_at = now(), approved_by_user_id = p_by
     where game_id = torny_rls.game_id() and user_id = p_target;
    get diagnostics v_rows = row_count;
    return v_rows > 0;
  exception when insufficient_privilege then return false;
  end;
  $$;

create or replace function torny_rls.try_undeliver(p_target uuid)
  returns boolean language plpgsql as $$
  declare v_rows int;
  begin
    update public.game_players
       set submitted_at = null
     where game_id = torny_rls.game_id() and user_id = p_target;
    get diagnostics v_rows = row_count;
    return v_rows > 0;
  exception when insufficient_privilege then return false;
  end;
  $$;

create or replace function torny_rls.approved_by_of(p_target uuid)
  returns uuid language sql security definer as $$
    select approved_by_user_id from public.game_players
     where game_id = torny_rls.game_id() and user_id = p_target
  $$;

-- A second game, created by active_id, for the move and insert probes.
create or replace function torny_rls.other_game_id() returns uuid language sql immutable as $$
  select '00000000-0000-4000-a000-0000000000a9'::uuid
$$;

create or replace function torny_rls.try_move_row(p_target uuid, p_to uuid)
  returns boolean language plpgsql as $$
  declare v_rows int;
  begin
    update public.game_players
       set game_id = p_to
     where game_id = torny_rls.game_id() and user_id = p_target;
    get diagnostics v_rows = row_count;
    return v_rows > 0;
  exception when insufficient_privilege then return false;
  end;
  $$;

create or replace function torny_rls.try_insert_row(p_game uuid, p_user uuid, p_approved boolean)
  returns boolean language plpgsql as $$
  begin
    insert into public.game_players (game_id, user_id, flight_number, approved_at, approved_by_user_id)
      values (p_game, p_user, 1,
              case when p_approved then now() end,
              case when p_approved then torny_rls.admin_id() end);
    return true;
  exception when insufficient_privilege or unique_violation then return false;
  end;
  $$;

create or replace function torny_rls.try_set_user(p_game uuid, p_from uuid, p_to uuid)
  returns boolean language plpgsql as $$
  declare v_rows int;
  begin
    update public.game_players
       set user_id = p_to
     where game_id = p_game and user_id = p_from;
    get diagnostics v_rows = row_count;
    return v_rows > 0;
  exception when insufficient_privilege or unique_violation then return false;
  end;
  $$;

-- Read as the service role so RLS never hides the row.
create or replace function torny_rls.submitted_by_of(p_target uuid)
  returns uuid language sql security definer as $$
    select submitted_by_user_id from public.game_players
     where game_id = torny_rls.game_id() and user_id = p_target
  $$;

-- Reopen a card as the service role (what the organiser's reopen does).
create or replace function torny_rls.reopen(p_target uuid)
  returns void language sql as $$
    update public.game_players
       set submitted_at = null, approved_at = null, approved_by_user_id = null
     where game_id = torny_rls.game_id() and user_id = p_target
  $$;

select torny_rls.reset();
select torny_rls.seed_active_game();

-- ── 1–2. Who delivered ────────────────────────────────────────────────────────
select torny_rls.as_user(torny_rls.active_id());
select torny_rls.try_deliver(torny_rls.active_id());
select torny_rls.try_deliver(torny_rls.flightmate_id());

select torny_rls.as_service();
select is(
  torny_rls.submitted_by_of(torny_rls.active_id()),
  torny_rls.active_id(),
  'own delivery records the player themselves (0191)'
);
select is(
  torny_rls.submitted_by_of(torny_rls.flightmate_id()),
  torny_rls.active_id(),
  'a flightmate delivering my card records the flightmate (0191)'
);

-- ── 3. Reopen clears it ───────────────────────────────────────────────────────
-- admin_id is the game's creator; reopen as a signed-in caller, not service.
select torny_rls.as_user(torny_rls.admin_id());
update public.game_players
   set submitted_at = null
 where game_id = torny_rls.game_id() and user_id = torny_rls.flightmate_id();

select torny_rls.as_service();
select is(
  torny_rls.submitted_by_of(torny_rls.flightmate_id()),
  null::uuid,
  'reopening a card clears submitted_by_user_id (0191)'
);

-- ── 4–5. Forgery from a signed-in client ──────────────────────────────────────
select torny_rls.as_user(torny_rls.active_id());
select torny_rls.try_deliver(torny_rls.flightmate_id(), torny_rls.admin_id());
select torny_rls.try_set_submitted_by(torny_rls.active_id(), torny_rls.flightmate_id());

select torny_rls.as_service();
select is(
  torny_rls.submitted_by_of(torny_rls.flightmate_id()),
  torny_rls.active_id(),
  'a forged submitted_by_user_id on delivery is overwritten with auth.uid() (0191)'
);
select is(
  torny_rls.submitted_by_of(torny_rls.active_id()),
  torny_rls.active_id(),
  'a forged submitted_by_user_id on a delivered card keeps the old value (0191)'
);

-- ── 6. The service role keeps its value (the app route) ──────────────────────
select torny_rls.reopen(torny_rls.flightmate_id());
update public.game_players
   set submitted_at = now(), submitted_by_user_id = torny_rls.submitted_id()
 where game_id = torny_rls.game_id() and user_id = torny_rls.flightmate_id();
select is(
  torny_rls.submitted_by_of(torny_rls.flightmate_id()),
  torny_rls.submitted_id(),
  'the service role keeps the submitted_by_user_id it wrote (0191)'
);

-- ── 7–8. The one who delivered may not approve the card ──────────────────────
select torny_rls.reopen(torny_rls.flightmate_id());
select torny_rls.as_user(torny_rls.active_id());
select torny_rls.try_deliver(torny_rls.flightmate_id());
select ok(
  NOT torny_rls.try_approve(torny_rls.flightmate_id()),
  'the player who delivered a card may NOT approve it (0191 / owner 2026-09-27)'
);

select torny_rls.as_user(torny_rls.submitted_id());
select ok(
  torny_rls.try_approve(torny_rls.flightmate_id()),
  'another flightmate may approve a card someone else delivered (0191)'
);

-- ── 9. Hostile PATCH: a peer may still change only the allowlisted columns ───
select torny_rls.as_user(torny_rls.active_id());
select ok(
  NOT torny_rls.try_set_paid(torny_rls.flightmate_id()),
  'a peer may NOT change paid_at on another player''s row (allowlist, #704)'
);

-- ── 10. Outside the game: RLS matches 0 rows ─────────────────────────────────
select torny_rls.as_service();
select torny_rls.reopen(torny_rls.active_id());
select torny_rls.as_user(torny_rls.outsider_id());
select ok(
  NOT torny_rls.try_deliver(torny_rls.active_id()),
  'a user outside the game cannot deliver a card (can_score_for, 0 rows)'
);

-- ── 11. Another flight: RLS matches 0 rows ───────────────────────────────────
-- Five active players make it more than one flight, so can_score_for falls
-- back to the flight number.
select torny_rls.as_service();
update public.game_players
   set withdrawn_at = null, withdrawn_by_user_id = null
 where game_id = torny_rls.game_id() and user_id = torny_rls.withdrawn_id();
update public.game_players
   set flight_number = 2
 where game_id = torny_rls.game_id() and user_id = torny_rls.flightmate_id();
select torny_rls.reopen(torny_rls.flightmate_id());

select torny_rls.as_user(torny_rls.active_id());
select ok(
  NOT torny_rls.try_deliver(torny_rls.flightmate_id()),
  'a player in another flight cannot deliver the card (can_score_for, 0 rows)'
);

-- ── 12. A peer may not approve an open card ──────────────────────────────────
-- Approve first, deliver after: the service role (the app route, the team
-- cascade) skips the guard, so the approval itself has to be refused, or the
-- one who delivers ends up approving too. submitted_id shares flight 1 with
-- active_id, so RLS lets the write through and a FALSE is the guard.
select torny_rls.as_service();
select torny_rls.reopen(torny_rls.submitted_id());
select torny_rls.as_user(torny_rls.active_id());
select ok(
  NOT torny_rls.try_set_approval(torny_rls.submitted_id(), torny_rls.active_id()),
  'a peer may not approve a card that is not delivered (0191)'
);

-- ── 13. A forged approver is overwritten with the one who approves ─────────
-- Another peer names the deliverer as approver; the trigger records the peer.
select torny_rls.as_service();
select torny_rls.reopen(torny_rls.submitted_id());
select torny_rls.as_user(torny_rls.active_id());
select torny_rls.try_deliver(torny_rls.submitted_id());
select torny_rls.as_user(torny_rls.withdrawn_id());
select torny_rls.try_set_approval(torny_rls.submitted_id(), torny_rls.active_id());
select torny_rls.as_service();
select is(
  torny_rls.approved_by_of(torny_rls.submitted_id()),
  torny_rls.withdrawn_id(),
  'a forged approved_by_user_id is overwritten with auth.uid() (0191)'
);

-- ── 14. Insert: a forged value is overwritten too ────────────────────────────
select torny_rls.as_user(torny_rls.admin_id());
insert into public.game_players (game_id, user_id, team_number, flight_number, submitted_at, submitted_by_user_id)
  values (torny_rls.game_id(), torny_rls.outsider_id(), 1, 1, now(), torny_rls.flightmate_id());

select torny_rls.as_service();
select is(
  (select submitted_by_user_id from public.game_players
    where game_id = torny_rls.game_id() and user_id = torny_rls.outsider_id()),
  torny_rls.admin_id(),
  'a forged submitted_by_user_id on insert is overwritten with auth.uid() (0191)'
);

-- ── 15. A peer may not un-deliver a card while its approval stands ──────────
-- The other way to reach «approved, not delivered». The organiser delivered
-- and approved nothing here; the service role sets the state up.
select torny_rls.as_service();
update public.game_players
   set submitted_at = now(), approved_at = now(), approved_by_user_id = torny_rls.admin_id()
 where game_id = torny_rls.game_id() and user_id = torny_rls.submitted_id();
select torny_rls.as_user(torny_rls.active_id());
select ok(
  NOT torny_rls.try_undeliver(torny_rls.submitted_id()),
  'a peer may not un-deliver a card and leave its approval standing (0191)'
);

-- ── 16. …and neither may the card's owner (own-row clause (f)) ──────────────
-- Evaluator round 3: the owner un-delivering their own approved card left it
-- «approved, not delivered», and the app route could then complete it with
-- the deliverer as approver. submitted_id's card is still delivered and
-- approved by admin_id from 15.
select torny_rls.as_user(torny_rls.submitted_id());
select ok(
  NOT torny_rls.try_undeliver(torny_rls.submitted_id()),
  'the owner may not un-deliver their own card and leave its approval standing (0191, clause f)'
);

-- ── 17. The service role keeps the approver it wrote ────────────────────────
select torny_rls.as_service();
update public.game_players
   set approved_at = now(), approved_by_user_id = torny_rls.flightmate_id()
 where game_id = torny_rls.game_id() and user_id = torny_rls.active_id();
select is(
  torny_rls.approved_by_of(torny_rls.active_id()),
  torny_rls.flightmate_id(),
  'the service role keeps the approved_by_user_id it wrote (0191)'
);

-- ── 18–20. Another game, created by active_id ───────────────────────────────
select torny_rls.as_service();
insert into public.games (id, name, course_id, tee_box_id, status, game_mode, created_by, started_at)
  values (torny_rls.other_game_id(), 'RLS Other Game', torny_rls.course_id(),
          torny_rls.tee_box_id(), 'active', 'solo_strokeplay', torny_rls.active_id(), now());

-- 18. A row stays in its game. submitted_id shares flight 1 with active_id.
select torny_rls.as_user(torny_rls.active_id());
select ok(
  NOT torny_rls.try_move_row(torny_rls.submitted_id(), torny_rls.other_game_id()),
  'a signed-in player may not move a game_players row to another game (0191)'
);

-- 19. The creator may not insert an already approved row, own row included.
select ok(
  NOT torny_rls.try_insert_row(torny_rls.other_game_id(), torny_rls.active_id(), true),
  'a signed-in non-admin may not insert an approved row (0191)'
);

-- 20. …but a plain row goes in as before.
select ok(
  torny_rls.try_insert_row(torny_rls.other_game_id(), torny_rls.active_id(), false),
  'a signed-in creator may still insert a plain row (0191)'
);

-- 21. A row stays with its player, even for the game's creator.
select ok(
  NOT torny_rls.try_set_user(torny_rls.other_game_id(), torny_rls.active_id(), torny_rls.flightmate_id()),
  'a signed-in non-admin, creator included, may not move a row to another player (0191)'
);

select * from finish();
rollback;
