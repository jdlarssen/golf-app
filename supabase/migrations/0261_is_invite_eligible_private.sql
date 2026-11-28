-- 0261_is_invite_eligible_private.sql
-- #3019: is_invite_eligible(creator, recipient, group) has asked
-- is_blocked_between since 0259, and any signed-in user could call it with
-- any two ids (granted in 0115). A third person who had played with both
-- could then see a block appear as a change from true to false: the same
-- leak 0260 closed. No client calls it; its callers, roster_candidates
-- (0181) and guard_game_players_invite_eligibility, are SECURITY DEFINER.

revoke execute on function public.is_invite_eligible(uuid, uuid, uuid) from authenticated;
