-- 0240_games_repeat_weekly.sql
-- =============================================================================
-- #2460 - «Gjenta hver uke»: a standalone round can ask Tørny to create the
-- next one, a week later, when it is finished.
--
-- TWO COLUMNS
--   repeat_weekly          The organiser's switch (wizard step «Klar?», and
--                          «Rediger spill» to turn it off). Written by the
--                          organiser's own client.
--   repeated_from_game_id  The successor's link back to the round it was made
--                          from. Written only by the server, when
--                          spawnWeeklyRepeat() creates the next round inside
--                          runFinishPipeline (service role).
--
-- WHY THE LINK IS UNIQUE
-- The finish tail runs once per finish (finish_pipeline_at, 0169), but
-- reopenGame clears that marker, so a reopened round that is finished again
-- runs the tail a second time. The unique constraint on repeated_from_game_id is
-- what makes the next round exist only once: the second insert gets 23505 and
-- the server reads that as «already there», not as an error.
--
-- WHO MAY WRITE WHAT
--   repeat_weekly needs no new policy. The only UPDATE policies on games are
--   «games creator update» (created_by = auth.uid()) and «games admin update»,
--   so only the organiser and global admins can write it. A PATCH from anyone
--   else matches 0 rows (supabase/tests/games_repeat_weekly_test.sql).
--
--   repeated_from_game_id is server-owned. Without a guard an organiser could
--   point their own game at someone else's round and block that round's
--   successor (the unique constraint would refuse it). RLS cannot say «this one
--   column is the server's», so a BEFORE trigger does, mirroring
--   guard_games_finish_pipeline_at (0169): 42501 for every authenticated
--   non-admin, service role (auth.uid() is null) and is_admin() pass.
--   Setting the link to NULL is not checked, as in
--   guard_games_competition_links (0185): ON DELETE SET NULL runs as the user
--   who deleted the source round, and refusing it would make an organiser
--   unable to delete their own round once it has a successor.
--
-- THE STANDALONE RULE
-- Cup matches, league rounds and derived games never repeat:
--   games_repeat_weekly_standalone. The club rule (group_id without a cup,
-- isClubTournament) stays in TypeScript, where it is defined
-- (lib/games/registration.ts); lib/games/weeklyRepeat.ts is the one home of the
-- whole rule and lib/games/weeklyRepeat.test.ts checks it agrees with this
-- CHECK.
--
-- DEPLOY ORDER: additive, and it goes to prod BEFORE the code is merged. The
-- finish tail reads repeat_weekly from the first finish after the deploy;
-- without the column the read gets 42703 and spawnWeeklyRepeat skips, and the
-- wizard's insert of repeat_weekly would fail outright.
-- =============================================================================

alter table public.games
  add column if not exists repeat_weekly boolean not null default false,
  add column if not exists repeated_from_game_id uuid
    references public.games (id) on delete set null;

alter table public.games
  add constraint games_repeated_from_game_id_key unique (repeated_from_game_id);

alter table public.games
  add constraint games_repeat_weekly_standalone check (
    not repeat_weekly
    or (tournament_id is null and league_round_id is null and source_game_id is null)
  );

comment on column public.games.repeat_weekly is
  '#2460: «Gjenta hver uke». When a finished round has this on, runFinishPipeline creates the next round one week later, same weekday and Oslo time, same players, course, tee and format. Standalone rounds only (games_repeat_weekly_standalone; the club rule lives in lib/games/weeklyRepeat.ts). Written by the organiser or an admin.';

comment on column public.games.repeated_from_game_id is
  '#2460: the round this one was created from by «Gjenta hver uke». Unique, so a round gets at most one successor even when it is reopened and finished again. Written only by the service role and global admins; enforced by guard_games_repeated_from_game_id.';

-- -- Guard trigger function ----------------------------------------------------
-- Same shape as guard_games_finish_pipeline_at (0169): SECURITY DEFINER so
-- public.is_admin() can read public.users, search_path = '' with every
-- reference schema-qualified. Covers INSERT as well as UPDATE.
create or replace function public.guard_games_repeated_from_game_id()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
  as $$
  begin
    -- Service role (spawnWeeklyRepeat inside the finish tail) carries no JWT
    -- sub, so auth.uid() is NULL. Global admins have full access per RLS.
    if auth.uid() is null or public.is_admin() then
      return new;
    end if;

    if new.repeated_from_game_id is null then
      return new;
    end if;

    if tg_op = 'INSERT'
      or new.repeated_from_game_id is distinct from old.repeated_from_game_id then
      raise exception
        'repeated_from_game_id is set by the server when it creates the next weekly round and cannot be set by a client (games.repeated_from_game_id)'
        using errcode = 'insufficient_privilege';  -- SQLSTATE 42501
    end if;

    return new;
  end;
  $$;

comment on function public.guard_games_repeated_from_game_id() is
  '#2460: blocks any non-admin authenticated user from setting or changing games.repeated_from_game_id to a non-null value. The link is written by the server (spawnWeeklyRepeat) via the service role, and its unique constraint decides whether a round gets its weekly successor. No-ops for the service role (auth.uid() IS NULL), global admins (is_admin()) and a change to NULL (ON DELETE SET NULL).';

drop trigger if exists guard_games_repeated_from_game_id on public.games;
create trigger guard_games_repeated_from_game_id
  before insert or update of repeated_from_game_id on public.games
  for each row
  execute function public.guard_games_repeated_from_game_id();

-- Trigger functions never need client-callable EXECUTE (0137, 0150).
revoke execute on function public.guard_games_repeated_from_game_id() from public, anon, authenticated;
