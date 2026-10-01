-- 0196 (#2222): users.hcp_index had no CHECK. The −10..54 bound lived only in
-- lib/users/profileInput.ts (HCP_MIN / HCP_MAX), which a direct PostgREST
-- PATCH on your own row bypasses: the "users update own" policy checks only
-- whose row it is, and guard_users_self_update never looks at hcp_index. A
-- value like 999.9 is frozen into the course handicap at start and gives
-- thousands of strokes in stableford and best ball.
--
-- lib/users/hcpIndexDbCheck.test.ts keeps this bound equal to HCP_MIN /
-- HCP_MAX; supabase/tests/users_hcp_index_check_test.sql proves a player's
-- own PATCH is refused.
--
-- `add constraint` validates the existing rows and fails if any lies outside.
-- Precheck before applying (0 on staging and prod):
--   select count(*) from public.users where hcp_index < -10 or hcp_index > 54;
--
-- Order against prod: no code depends on it, so before or after the app.

alter table public.users
  add constraint users_hcp_index_range check (hcp_index between -10 and 54);
