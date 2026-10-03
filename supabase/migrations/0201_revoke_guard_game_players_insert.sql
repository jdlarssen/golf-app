-- 0201 — Close the client EXECUTE surface on guard_game_players_insert() (#2304).
--
-- 0191 added this SECURITY DEFINER trigger function without the revoke every
-- other guard trigger got in 0137 (#1121), so prod-vakta's security advisor
-- flags it as executable by anon and authenticated. It is a trigger function,
-- never an RPC, so no client has a reason to hold EXECUTE on it. The trigger
-- keeps firing after the revoke: trigger dispatch does not check the caller's
-- EXECUTE privilege. postgres (owner) and service_role keep their grants.
revoke execute on function public.guard_game_players_insert() from public, anon, authenticated;
