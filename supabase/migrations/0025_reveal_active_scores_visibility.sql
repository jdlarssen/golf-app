-- Allow all participants to read all scores while a reveal-mode game is active.
--
-- Why: The live brutto leaderboard (RevealBruttoView) is designed to show
-- best-ball brutto across ALL teams during play, with netto rankings reserved
-- for the finished-state reveal. The existing `scores select gating` policy
-- restricts non-admin reads to own-flight scores during active play — which
-- silently breaks the cross-flight brutto view (other flights' team rows
-- render as "18 hull mangler"). Confirmed via first pilot round 2026-05-14
-- where non-admin players reported seeing only their own flight.
--
-- This adds a new clause that grants participants read access to all scores
-- when game.status='active' AND game.score_visibility='reveal'. Live-mode
-- gating (front-9-only via state3.5) is unchanged because that view's
-- climax-hiding contract relies on back-9 scores being unreadable mid-round.

drop policy if exists "scores select gating" on public.scores;

create policy "scores select gating"
  on public.scores
  for select
  using (
    is_admin()
    or (
      exists (
        select 1 from public.games g
        where g.id = scores.game_id
          and g.status = 'finished'::game_status
      )
      and exists (
        select 1 from public.game_players gp
        where gp.game_id = scores.game_id
          and gp.user_id = auth.uid()
      )
    )
    or (
      exists (
        select 1 from public.games g
        where g.id = scores.game_id
          and g.status = 'active'::game_status
          and g.score_visibility = 'reveal'
      )
      and exists (
        select 1 from public.game_players gp
        where gp.game_id = scores.game_id
          and gp.user_id = auth.uid()
      )
    )
    or user_id = auth.uid()
    or same_flight(scores.game_id, scores.user_id)
  );
