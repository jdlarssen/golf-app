-- 0165_rename_hole_segment_check.sql
--
-- #1649: prod and staging hold the SAME hole_segment CHECK under different
-- names. Prod got the auto-generated `games_hole_segment_check` (constraint
-- added inline on the column); staging/migrations name it
-- `games_hole_segment_valid` (0151). Identical definition, so nothing is
-- broken today — but any future migration touching the constraint BY NAME
-- would pass staging and crash on prod (`constraint ... does not exist`).
--
-- Idempotent rename: a no-op wherever the target name already exists
-- (staging, fresh builds from migrations), a pure metadata rename on prod.
-- No revalidation, no locking beyond a brief ACCESS EXCLUSIVE on games.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.games'::regclass
      and conname = 'games_hole_segment_check'
  ) then
    alter table public.games
      rename constraint games_hole_segment_check to games_hole_segment_valid;
  end if;
end $$;
