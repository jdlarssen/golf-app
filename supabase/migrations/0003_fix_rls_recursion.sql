-- Fix RLS infinite recursion on game_players.
--
-- The original "game_players select shared game" policy queried game_players
-- inside its own USING clause. Postgres detects this structurally and refuses
-- to evaluate any query that transitively touches game_players — including
-- the users SELECT policy, which has an exists(... from game_players ...)
-- branch.
--
-- Fix: move the self-reference into a SECURITY DEFINER helper function (same
-- pattern as is_admin() and same_flight() already use). SECURITY DEFINER
-- bypasses RLS, breaking the recursion.

create or replace function public.is_in_game(p_game_id uuid) returns boolean
  language sql security definer stable
  as $$
    select exists(
      select 1 from public.game_players
      where game_id = p_game_id and user_id = auth.uid()
    );
  $$;

drop policy if exists "game_players select shared game" on public.game_players;

create policy "game_players select shared game" on public.game_players
  for select using (
    public.is_admin()
    or public.is_in_game(public.game_players.game_id)
  );
