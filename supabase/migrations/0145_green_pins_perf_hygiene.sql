-- 0145_green_pins_perf_hygiene.sql (#1252)
-- ─────────────────────────────────────────────────────────────────────────────
-- Two performance-advisor findings on green_pins (0142, #1210), flagged by
-- Supabase advisors 2026-07-15:
--
--   1. auth_rls_initplan (WARN ×2): the insert/delete policies call auth.uid()
--      bare, so Postgres re-evaluates it per row. Wrapping in (select …) makes
--      it an init-plan constant — same pattern as 0092 applied fleet-wide.
--      Semantics are unchanged: NULL = (select auth.uid()) is still never true,
--      so the insert policy keeps blocking NULL user_id rows from clients.
--
--   2. unindexed_foreign_keys (INFO): green_pins_user_id_fkey has no covering
--      index. Hits the ON DELETE SET NULL path and the anonymization UPDATE
--      (0142 nulls user_id on account deletion).
--
-- The advisor's unused_index note on green_pins_course_hole_idx is noise (the
-- table was days old) — deliberately not acted on.
-- ─────────────────────────────────────────────────────────────────────────────

alter policy "green_pins insert own" on public.green_pins
  with check (user_id = (select auth.uid()));

alter policy "green_pins delete own" on public.green_pins
  using (user_id = (select auth.uid()));

create index green_pins_user_id_idx on public.green_pins (user_id);
