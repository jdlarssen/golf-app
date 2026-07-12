-- supabase/tests/green_pins_rls_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- RLS / privilege / trigger integration test: green_pins (#1210, migration 0142),
-- end-to-end against real Postgres roles.
--
--   ALLOWED (the crowdsourcing paths that must work):
--     1. signed-in user INSERTs a pin as themselves           → PASS
--     2. ANOTHER signed-in user SELECTs pins (world-read,
--        explicit column list WITHOUT user_id)                → PASS
--     3. owner DELETEs their own pin (by id)                  → PASS
--
--   FORBIDDEN (hostile direct-request surface):
--     4. SELECT of the user_id column                         → REJECTED (column privilege — presence surface)
--     5. INSERT with a forged user_id (someone else's)        → REJECTED (RLS with check)
--     6. INSERT with user_id NULL                             → REJECTED (RLS with check)
--     7. UPDATE (own row, by id)                              → REJECTED (no policy + privilege revoked)
--     8. DELETE of someone else's pin (by id)                 → REJECTED (RLS using → 0 rows)
--     9. anon role: any read                                  → REJECTED (all privileges revoked)
--
--   Gate backstop (green_pins_gate, trap #4 outer guard):
--    10. pins #1–#3 on a hole land; pin #4 inside the window  → REJECTED (check_violation)
--    11. 3 aged-out pins (older than the window) don't count  → a fresh pin lands
--
--   CHECK constraints (design edge row «Ugyldig lat/lng mot DB»):
--    12. lat 91 / hole_number 19 / accuracy -1                → REJECTED
--
-- Probes that filter rows do it BY id, never by user_id — authenticated has no
-- SELECT privilege on user_id, so a user_id in a WHERE clause would fail on the
-- column privilege and mask what the assert is actually about.
--
-- Runs as the `authenticated` role with a forged JWT `sub` claim — the same
-- runtime path the app uses. See supabase/tests/README.md for the rig.
-- Run via:  supabase test db   (npm run test:rls)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(18);

\ir fixtures/rls_helpers.psql

-- Seed: users + course come from the shared fixture graph.
select torny_rls.as_service();
select torny_rls.seed_active_game();

-- ── Local probes (rolled back with the transaction) ──────────────────────────

-- try_insert_pin(owner, hole, accuracy): current impersonated role INSERTs a pin
-- claiming `owner` as user_id. TRUE if it landed; FALSE on an RLS/privilege
-- reject. Gate rejections (check_violation) are NOT swallowed here — the gate
-- asserts use throws_ok so the errcode itself is verified.
create or replace function torny_rls.try_insert_pin(p_owner uuid, p_hole int, p_accuracy real default 8)
  returns boolean
  language plpgsql
  as $$
  begin
    insert into public.green_pins (course_id, hole_number, lat, lng, accuracy_m, user_id)
      values (torny_rls.course_id(), p_hole, 59.9139, 10.7522, p_accuracy, p_owner);
    return true;
  exception
    when insufficient_privilege then return false;
  end;
  $$;

-- pin_id_on_hole(hole): id of a pin on the given hole, read as the service role
-- so the lookup itself never trips privileges. Probes below filter by this id.
create or replace function torny_rls.pin_id_on_hole(p_hole int)
  returns uuid
  language plpgsql
  as $$
  declare
    v_prev text := current_setting('role', true);
    v_id uuid;
  begin
    perform set_config('role', 'postgres', true);
    select id into v_id from public.green_pins
      where course_id = torny_rls.course_id() and hole_number = p_hole
      order by created_at limit 1;
    perform set_config('role', coalesce(nullif(v_prev, ''), 'postgres'), true);
    return v_id;
  end;
  $$;

-- try_update_pin(id): attempt to move the pin. FALSE on privilege reject
-- (UPDATE is revoked for authenticated) or 0 rows.
create or replace function torny_rls.try_update_pin(p_id uuid)
  returns boolean
  language plpgsql
  as $$
  declare v_rows int;
  begin
    update public.green_pins set lat = 0, lng = 0 where id = p_id;
    get diagnostics v_rows = row_count;
    return v_rows > 0;
  exception
    when insufficient_privilege then return false;
  end;
  $$;

-- try_delete_pin(id): attempt to delete the pin. FALSE on privilege reject or
-- 0 rows (RLS USING filters foreign rows to 0).
create or replace function torny_rls.try_delete_pin(p_id uuid)
  returns boolean
  language plpgsql
  as $$
  declare v_rows int;
  begin
    delete from public.green_pins where id = p_id;
    get diagnostics v_rows = row_count;
    return v_rows > 0;
  exception
    when insufficient_privilege then return false;
  end;
  $$;

-- try_select_pins(): world-read with the app's explicit column list (no
-- user_id). TRUE when the read succeeds (row count is irrelevant).
create or replace function torny_rls.try_select_pins()
  returns boolean
  language plpgsql
  as $$
  declare v_count int;
  begin
    select count(id) into v_count
      from (select id, course_id, hole_number, lat, lng, accuracy_m, created_at
              from public.green_pins) s;
    return true;
  exception
    when insufficient_privilege then return false;
  end;
  $$;

-- try_select_pin_owner(): the presence-surface probe — read user_id directly.
create or replace function torny_rls.try_select_pin_owner()
  returns boolean
  language plpgsql
  as $$
  declare v uuid;
  begin
    select user_id into v from public.green_pins limit 1;
    return true;
  exception
    when insufficient_privilege then return false;
  end;
  $$;

-- probe_as_anon_select(): run the world-read probe under the anon role, then
-- restore the service role. The pgTAP assert itself must NOT run as anon (anon
-- has no business executing pgtap), so the role flip is encapsulated here.
create or replace function torny_rls.probe_as_anon_select()
  returns boolean
  language plpgsql
  as $$
  declare v boolean;
  begin
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', null, true);
    v := torny_rls.try_select_pins();
    perform set_config('role', 'postgres', true);
    return v;
  end;
  $$;

grant execute on all functions in schema torny_rls to authenticated, anon, service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- ALLOWED — insert own, world-read (without user_id)
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.active_id());

select ok(
  torny_rls.try_insert_pin(torny_rls.active_id(), 1),
  'signed-in user CAN insert a pin as themselves'
);

select torny_rls.as_user(torny_rls.outsider_id());
select ok(
  torny_rls.try_select_pins(),
  'ANOTHER signed-in user CAN read pins via the explicit column list (global crowdsourced data)'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- FORBIDDEN — the hostile direct-request surface
-- ═════════════════════════════════════════════════════════════════════════════

select ok(
  not torny_rls.try_select_pin_owner(),
  'user_id column is NOT client-readable (column privilege — presence surface)'
);

select ok(
  not torny_rls.try_insert_pin(torny_rls.active_id(), 2),
  'INSERT with a FORGED user_id (someone else''s) is blocked by RLS with check'
);

select ok(
  not torny_rls.try_insert_pin(null, 2),
  'INSERT with user_id NULL is blocked (null never equals auth.uid())'
);

select torny_rls.as_user(torny_rls.active_id());
select ok(
  not torny_rls.try_update_pin(torny_rls.pin_id_on_hole(1)),
  'UPDATE is blocked even on one''s OWN pin (no policy + privilege revoked — immutable rows)'
);

select torny_rls.as_user(torny_rls.outsider_id());
select ok(
  not torny_rls.try_delete_pin(torny_rls.pin_id_on_hole(1)),
  'DELETE of someone else''s pin is blocked (RLS using filters to 0 rows)'
);

select torny_rls.as_user(torny_rls.active_id());
select ok(
  torny_rls.try_delete_pin(torny_rls.pin_id_on_hole(1)),
  'owner CAN delete their own pin (the undo door stays open)'
);

-- anon: zero access of any kind (asserted from the service role — the probe
-- flips to anon internally).
select torny_rls.as_service();
select ok(
  not torny_rls.probe_as_anon_select(),
  'anon role has NO read access at all (privileges revoked)'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- Gate backstop — green_pins_gate (trap #4: the DB is the outer guard)
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.active_id());

select ok(torny_rls.try_insert_pin(torny_rls.active_id(), 5), 'gate: pin #1 on hole 5 lands');
select ok(torny_rls.try_insert_pin(torny_rls.active_id(), 5), 'gate: pin #2 on hole 5 lands');
select ok(torny_rls.try_insert_pin(torny_rls.active_id(), 5), 'gate: pin #3 on hole 5 lands');

-- Pin #4 — from a DIFFERENT user, proving the gate counts per hole, not per
-- user — trips the trigger with check_violation (23514).
select torny_rls.as_user(torny_rls.flightmate_id());
select throws_ok(
  $$ insert into public.green_pins (course_id, hole_number, lat, lng, accuracy_m, user_id)
       values (torny_rls.course_id(), 5, 59.9139, 10.7522, 8, torny_rls.flightmate_id()) $$,
  '23514',
  null,
  'gate: pin #4 on the same hole inside the window is REJECTED by green_pins_gate'
);

-- Aged-out pins don't count: seed 3 pins older than the 30-day window on hole 6,
-- then a fresh authenticated insert must still land (collection reopens as the
-- hole placement moves over time).
select torny_rls.as_service();
insert into public.green_pins (course_id, hole_number, lat, lng, accuracy_m, user_id, created_at)
  select torny_rls.course_id(), 6, 59.9139, 10.7522, 8, torny_rls.active_id(), now() - interval '31 days'
  from generate_series(1, 3);

select torny_rls.as_user(torny_rls.active_id());
select ok(
  torny_rls.try_insert_pin(torny_rls.active_id(), 6),
  'gate: 3 pins OLDER than the window do not block a fresh pin (window semantics)'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- CHECK constraints — invalid coordinates / hole / accuracy rejected by the DB
-- ═════════════════════════════════════════════════════════════════════════════

select throws_ok(
  $$ insert into public.green_pins (course_id, hole_number, lat, lng, accuracy_m, user_id)
       values (torny_rls.course_id(), 7, 91, 10.7522, 8, torny_rls.active_id()) $$,
  '23514',
  null,
  'CHECK rejects lat outside -90..90'
);

select throws_ok(
  $$ insert into public.green_pins (course_id, hole_number, lat, lng, accuracy_m, user_id)
       values (torny_rls.course_id(), 19, 59.9139, 10.7522, 8, torny_rls.active_id()) $$,
  '23514',
  null,
  'CHECK rejects hole_number outside 1..18'
);

select throws_ok(
  $$ insert into public.green_pins (course_id, hole_number, lat, lng, accuracy_m, user_id)
       values (torny_rls.course_id(), 7, 59.9139, 10.7522, -1, torny_rls.active_id()) $$,
  '23514',
  null,
  'CHECK rejects negative accuracy_m'
);

-- Sanity: the service-role seeding above landed (proves the asserts above ran
-- against real rows, and that service-role writes bypass the gate wiring).
select torny_rls.as_service();
select ok(
  (select count(id) from public.green_pins where course_id = torny_rls.course_id()) >= 4,
  'sanity: fixture pins exist (3 gate pins + 3 aged + 1 reopened, minus deletes)'
);

select * from finish();
rollback;
