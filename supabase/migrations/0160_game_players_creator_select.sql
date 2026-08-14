-- 0160_game_players_creator_select.sql
--
-- #1595: a game CREATOR who does not PLAY in their own game could not approve a
-- scorecard — the click reported success and nothing was written.
--
-- Root cause (verified against live staging pg_policies, not recall): the only
-- SELECT policy on game_players is
--
--     "game_players select shared game"  →  is_admin() OR is_in_game(game_id)
--
-- There is no creator branch. Postgres requires that the rows an UPDATE touches
-- also pass the table's SELECT policy, so a non-participating creator matched 0
-- rows on every game_players write even though "game_players creator update"
-- would have allowed it. PostgREST returns error == null for a 0-row UPDATE
-- (trap 2), so `adminApproveScorecard` read that as "already approved" and
-- redirected to the success banner. Same blind spot hit reopenScorecard,
-- adminWithdrawPlayer, adminUndoWithdraw and reopenGame — one policy cures all
-- five, which is why the fix lives here and not in five call-sites (trap 4).
--
-- The new policy is ADDITIVE and PERMISSIVE: it OR-s with the existing
-- "game_players select shared game" (which stays untouched), so player, admin
-- and flight reads are byte-identical to before. The qual is copied verbatim
-- from the sibling creator policies ("game_players creator insert/update/
-- delete", 0071 + the (SELECT auth.uid()) perf wrap from 0092) so the four
-- creator policies keep one shape.
--
-- Disclosure: none beyond intent. The creator-facing surfaces
-- (/games/[id]/spillere via getGameWithPlayers) already render this roster
-- through the service-role client; this only gives RLS parity with the UI the
-- creator is already looking at, and it is scoped to games where
-- games.created_by = auth.uid().

create policy "game_players creator select"
  on public.game_players for select
  to authenticated
  using (exists (
    select 1 from public.games g
    where g.id = game_players.game_id
      and g.created_by = (select auth.uid())
  ));

comment on policy "game_players creator select" on public.game_players is
  '#1595: the game creator may read their own game''s roster even when they are '
  'not a player in it. Without this SELECT branch every creator UPDATE on '
  'game_players (approve, reopen, withdraw) silently matched 0 rows — Postgres '
  'requires updated rows to pass the SELECT policy too. Additive/permissive: '
  'OR-s with "game_players select shared game". Coverage: '
  'supabase/tests/game_players_creator_select_rls_test.sql.';
