-- Add public.games to the realtime publication so clients can subscribe to
-- status transitions (e.g. admin pressing "Avslutt spillet" flips status to
-- 'finished' and active leaderboard viewers need to auto-refresh into the
-- reveal/full view). RLS on games already restricts SELECT to participants
-- so subscribers only see games they're allowed to see.
alter publication supabase_realtime add table public.games;
