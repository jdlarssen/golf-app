-- Peer/admin review of a submitted scorecard can reject it with a reason.
-- Storing the reason on game_players lets the rejected player see why the
-- next time they open the game home page.
alter table public.game_players add column rejection_reason text;
