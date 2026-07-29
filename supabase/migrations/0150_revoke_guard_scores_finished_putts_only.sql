-- 0150_revoke_guard_scores_finished_putts_only.sql (prod-vakt #1411)
-- ─────────────────────────────────────────────────────────────────────────────
-- Revoke public/anon/authenticated EXECUTE on the 0148 column-guard trigger
-- function guard_scores_finished_putts_only().
--
-- 0137 revoked EXECUTE from public/anon/authenticated on every guard_* trigger
-- function that existed at the time (guard_scores_self_update, guard_game_
-- players_*, guard_users_self_update, etc. — trigger functions never need
-- direct RPC-callable EXECUTE, Postgres invokes them via the trigger mechanism
-- regardless of function grants). 0148 added a new guard trigger,
-- guard_scores_finished_putts_only(), without the matching revoke, so it kept
-- Postgres's default PUBLIC-executable grant — flagged by the security advisor
-- as anon/authenticated-callable via /rest/v1/rpc/guard_scores_finished_putts_only
-- (prod-vakt issue #1411). Same fix as 0137, applied to the one function that
-- missed it.
-- ─────────────────────────────────────────────────────────────────────────────

revoke execute on function public.guard_scores_finished_putts_only() from public, anon, authenticated;
