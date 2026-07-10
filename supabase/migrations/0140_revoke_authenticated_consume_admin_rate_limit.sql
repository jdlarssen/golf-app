-- 0140_revoke_authenticated_consume_admin_rate_limit.sql (#1131)
-- ─────────────────────────────────────────────────────────────────────────────
-- Revoke authenticated-EXECUTE on consume_admin_rate_limit(text,integer,integer).
--
-- The RPC kept an authenticated grant (baselined under #1121, 0137) only
-- because the admin-invite rate-limiter (lib/admin/rateLimit.ts) used to call
-- it via the signed-in admin's own client. That meant any authenticated user
-- could call the RPC with an arbitrary p_bucket and grief another user's
-- bucket (bucket keys embed IDs). #1131 routes the admin-invite limiter through
-- the service-role client (getAdminClient), like the login and self-reg
-- limiters already do — so authenticated no longer needs EXECUTE.
--
-- service_role has its own explicit EXECUTE grant (Supabase default
-- privileges), so login/self-reg/admin-invite (all service-role) keep working.
-- ─────────────────────────────────────────────────────────────────────────────

revoke execute on function public.consume_admin_rate_limit(text, integer, integer) from authenticated;
