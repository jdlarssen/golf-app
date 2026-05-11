-- Realtime filter `game_id=eq.X` requires game_id to be present in every
-- UPDATE event payload. Postgres' default WAL identity for UPDATEs is only
-- the primary key + changed columns; since game_id never changes on a score
-- update, the filter would silently drop the event.
--
-- REPLICA IDENTITY FULL writes every column to the WAL on every change, so
-- Realtime subscriptions get the full row and the game_id filter matches.
alter table public.scores replica identity full;
