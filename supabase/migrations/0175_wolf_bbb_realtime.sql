-- 0175_wolf_bbb_realtime.sql
-- #1836: Wolf-valget og Bingo Bango Bongo-registreringen never reached the rest
-- of the flight live. `lib/wolf/subscribeWolfChoices.ts` and
-- `lib/bbb/subscribeBingoBangoBongo.ts` have subscribed to postgres_changes on
-- these tables since 0049/0053, but neither table was ever added to the
-- supabase_realtime publication — so the channels joined and stayed silent.
--
-- No REPLICA IDENTITY FULL here (unlike reactions 0120 / scores 0006): game_id
-- is the FIRST primary-key column on both tables, so the default replica
-- identity already ships it in the WAL and the channels' `game_id=eq.<id>`
-- filter matches UPDATE and DELETE events too. And no user flow deletes these
-- rows — clearing a category writes NULL, it does not delete.
--
-- The guard makes the file idempotent: CI's fresh stack, staging and prod may
-- already have (part of) the publication, and `alter publication ... add table`
-- errors on a duplicate.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'wolf_hole_choices'
  ) then
    alter publication supabase_realtime add table public.wolf_hole_choices;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'bingo_bango_bongo_holes'
  ) then
    alter publication supabase_realtime add table public.bingo_bango_bongo_holes;
  end if;
end $$;
