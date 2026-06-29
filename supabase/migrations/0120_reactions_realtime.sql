-- 0120_reactions_realtime.sql
-- #943: make the reactions table emit realtime change events so a viewer's
-- leaderboard updates live when other participants react.
--
-- REPLICA IDENTITY FULL writes every column to the WAL on every change, so a
-- DELETE event (an un-react) carries game_id/target_user_id/emoji — otherwise
-- the channel's `game_id=eq.<id>` filter can't match a DELETE (default replica
-- identity ships only the primary key). Same reasoning as scores (0006).
alter table public.reactions replica identity full;

-- Add to the realtime publication so postgres_changes events are emitted at all
-- (same pattern as scores 0005 / games 0022 / notifications 0032).
alter publication supabase_realtime add table public.reactions;
