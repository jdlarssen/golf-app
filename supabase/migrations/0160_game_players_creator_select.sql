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
-- The qual MUST go through the SECURITY DEFINER helper, not an inline
-- EXISTS on games: "games select if participant or admin" references
-- game_players inline, so a game_players SELECT policy that references games
-- inline closes the cycle game_players → games → game_players and every
-- authenticated read of game_players dies with 42P17 (infinite recursion).
-- Proven live on staging 2026-08-14: the inline-EXISTS variant of this policy
-- took down all authenticated game_players reads and was dropped again. The
-- sibling creator INSERT/UPDATE/DELETE policies get away with the inline form
-- because only a SELECT policy participates in that cycle.
--
-- `is_game_creator_or_admin` (0107-hardened, SECURITY DEFINER, stable) already
-- expresses exactly this intent and is what the trigger-side guards use. Its
-- admin half overlaps is_admin() in the shared-game policy — harmless OR.
--
-- Disclosure: none beyond intent. The creator-facing surfaces
-- (/games/[id]/spillere via getGameWithPlayers) already render this roster
-- through the service-role client; this only gives RLS parity with the UI the
-- creator is already looking at, and it is scoped to games where
-- games.created_by = auth.uid().

create policy "game_players creator select"
  on public.game_players for select
  to authenticated
  using (public.is_game_creator_or_admin(game_id));

comment on policy "game_players creator select" on public.game_players is
  '#1595: the game creator may read their own game''s roster even when they are '
  'not a player in it. Without this SELECT branch every creator UPDATE on '
  'game_players (approve, reopen, withdraw) silently matched 0 rows — Postgres '
  'requires updated rows to pass the SELECT policy too. Must stay on the '
  'SECURITY DEFINER helper: an inline EXISTS on games recurses via "games '
  'select if participant or admin" (42P17). Coverage: '
  'supabase/tests/game_players_creator_select_rls_test.sql.';
