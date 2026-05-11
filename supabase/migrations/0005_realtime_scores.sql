-- Make INSERT/UPDATE on scores stream over Supabase Realtime.
-- Flight-mates subscribe per game and react to each other's writes.
alter publication supabase_realtime add table public.scores;
