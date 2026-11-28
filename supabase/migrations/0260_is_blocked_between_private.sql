-- 0260_is_blocked_between_private.sql
-- #3019: is_blocked_between(a, b) answered any signed-in user for any two ids
-- (0259 granted execute to authenticated). That let a blocked person find out,
-- and a third person see who blocked whom. No RLS policy calls it, and every
-- function that does is SECURITY DEFINER (guard_friendships_block,
-- friend_request_by_email, is_invite_eligible, guard_game_players_invite_
-- eligibility, guard_tournament_participants_block), so they keep working.
-- The service role keeps it for the web's server code.

revoke execute on function public.is_blocked_between(uuid, uuid) from authenticated;
