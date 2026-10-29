-- supabase/tests/format_intent_mapping_write_rls_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- RLS integration test: who may reorder step 2 (#2347).
--
-- `moveFormat` writes `format_intent_mapping.sort_order` with the owner's
-- session, so RLS is the only authz between a signed-in player and the order
-- every organiser sees in the wizard. The policies under test:
--   format_intent_mapping_admin_update  using/check is_admin()
--   format_intent_mapping_admin_insert  check is_admin()
--
--   FORBIDDEN (a non-admin, via a direct PATCH/POST):
--     1. UPDATE sort_order                       → 0 rows
--     2. ... and the row is unchanged
--     3. the upsert moveFormat sends              → 42501
--
--   ALLOWED:
--     4. admin UPDATE sort_order                  → 1 row
--     5. admin upsert (moveFormat's write)        → lands
--
-- Runs as `authenticated` with a forged JWT `sub`, the app's runtime path.
-- Uses the stableford/kompis row migration 0047 seeds.
--
-- Run via:  supabase test db   (see supabase/tests/README.md)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

\ir fixtures/rls_helpers.psql

-- try_set_sort_order(order): the current impersonated user sets
-- stableford/kompis to `order`; returns the number of rows it reached.
create or replace function torny_rls.try_set_sort_order(p_order int) returns int
  language plpgsql as $$
  declare v_rows int;
  begin
    update public.format_intent_mapping
       set sort_order = p_order
     where format_slug = 'stableford' and intent = 'kompis';
    get diagnostics v_rows = row_count;
    return v_rows;
  end;
$$;

-- Users only; the game graph is not read by these policies.
select torny_rls.as_service();
select torny_rls.seed_active_game();
update public.format_intent_mapping set sort_order = 10
 where format_slug = 'stableford' and intent = 'kompis';

-- ═════════════════════════════════════════════════════════════════════════════
-- FORBIDDEN — a non-admin cannot reorder step 2
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.active_id());

select is(
  torny_rls.try_set_sort_order(999),
  0,
  'non-admin UPDATE of sort_order reaches 0 rows'
);

select torny_rls.as_service();
select is(
  (select sort_order from public.format_intent_mapping
     where format_slug = 'stableford' and intent = 'kompis'),
  10,
  'the row keeps its sort_order after the non-admin UPDATE'
);

select torny_rls.as_user(torny_rls.active_id());
select throws_ok(
  $$ insert into public.format_intent_mapping (format_slug, intent, sort_order)
       values ('stableford', 'kompis', 999)
     on conflict (format_slug, intent) do update set sort_order = excluded.sort_order $$,
  '42501',
  null,
  'non-admin upsert (the write moveFormat sends) is rejected with 42501'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- ALLOWED — the admin can
-- ═════════════════════════════════════════════════════════════════════════════
select torny_rls.as_user(torny_rls.admin_id());

select is(
  torny_rls.try_set_sort_order(20),
  1,
  'admin UPDATE of sort_order reaches 1 row'
);

insert into public.format_intent_mapping (format_slug, intent, sort_order)
  values ('stableford', 'kompis', 30)
on conflict (format_slug, intent) do update set sort_order = excluded.sort_order;

select torny_rls.as_service();
select is(
  (select sort_order from public.format_intent_mapping
     where format_slug = 'stableford' and intent = 'kompis'),
  30,
  'admin upsert (moveFormat''s write) lands'
);

select * from finish();
rollback;
