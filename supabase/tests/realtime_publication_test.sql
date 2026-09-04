-- supabase/tests/realtime_publication_test.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Catalog test for the supabase_realtime publication (#1836).
--
-- A postgres_changes subscription is silent — not failing — when its table is
-- missing from the publication: the channel joins, the client sees SUBSCRIBED,
-- and no event ever arrives. That is exactly how wolf_hole_choices and
-- bingo_bango_bongo_holes shipped from 0049/0053 until 0175 added them.
--
-- Every table with a client-side postgres_changes subscription must therefore
-- be a member of the publication. This asserts all six, so the Migrations gate
-- (.github/workflows/migrations-gate.yml, which runs `supabase test db` over
-- supabase/tests/) turns red if one is ever dropped — or if a new subscription
-- is added without publishing its table.
--
-- Catalog state only — no fixtures, no role impersonation, no seed.
-- Run via:  supabase test db
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

-- ── 1. bingo_bango_bongo_holes (0175 / #1836) ────────────────────────────────
select ok(
  exists(
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'bingo_bango_bongo_holes'
  ),
  '#1836: bingo_bango_bongo_holes is in the supabase_realtime publication'
);

-- ── 2. games (0022) ──────────────────────────────────────────────────────────
select ok(
  exists(
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'games'
  ),
  'games is in the supabase_realtime publication'
);

-- ── 3. notifications (0032) ──────────────────────────────────────────────────
select ok(
  exists(
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ),
  'notifications is in the supabase_realtime publication'
);

-- ── 4. reactions (0120 / #943) ───────────────────────────────────────────────
select ok(
  exists(
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'reactions'
  ),
  'reactions is in the supabase_realtime publication'
);

-- ── 5. scores (0005) ─────────────────────────────────────────────────────────
select ok(
  exists(
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'scores'
  ),
  'scores is in the supabase_realtime publication'
);

-- ── 6. wolf_hole_choices (0175 / #1836) ──────────────────────────────────────
select ok(
  exists(
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'wolf_hole_choices'
  ),
  '#1836: wolf_hole_choices is in the supabase_realtime publication'
);

select * from finish();

rollback;
