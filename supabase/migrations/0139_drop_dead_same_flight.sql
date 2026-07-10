-- 0139_drop_dead_same_flight.sql (#1129)
-- ─────────────────────────────────────────────────────────────────────────────
-- Drop the dead helper public.same_flight(uuid, uuid).
--
-- same_flight() (SECURITY DEFINER, first defined in 0002, last hardened in 0104)
-- is dead code: every RLS policy that once referenced it has been rewritten.
--   • SELECT gating   → same_flight_or_solo (0031, later 0092/0121)
--   • INSERT/UPDATE   → can_score_for       (0088)
--   • reveal clause    → superseded by the 0031 rewrite (0025)
-- #1121/0137 already revoked anon+PUBLIC EXECUTE and noted (0137:88-89) that the
-- function is "referenced by no policy at all — superseded by same_flight_or_solo".
-- This is the final step: drop it entirely.
--
-- Naked DROP, NOT cascade: if some unexpected object still depends on the
-- function, this fails loudly instead of silently tearing policies down with it.
-- A failure means the "dead" premise is wrong — stop and diagnose, do not add
-- cascade.
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.same_flight(uuid, uuid);
