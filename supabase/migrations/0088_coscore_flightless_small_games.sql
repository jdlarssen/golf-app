-- 0088_coscore_flightless_small_games.sql
-- Fix: in solo formats (skins, stableford, nassau, nines, wolf, acey_deucey,
-- round_robin, modified_stableford) `game_players.flight_number` is NULL by
-- design — solo play has no flights/teams (see lib/games/gamePayload.ts, which
-- sets flight_number = null for every solo builder). Two score policies gate
-- co-player access through helpers that compare `me.flight_number =
-- them.flight_number`. In SQL `NULL = NULL` is NULL (not TRUE), so two
-- flight-less players never match — a non-admin could neither WRITE nor (in
-- live mode) READ another player's score, only their own. The game admin
-- bypasses both via is_admin(), which is why a 2-player Skins round (reported
-- live 2026-06-07) let the creator enter both players' scores while the
-- co-player could only enter his own.
--
-- Same NULL-flight root cause, two policies:
--   * WRITE — "scores insert by flight" / "scores update by flight" call
--     same_flight(), which fails on NULL. Fixed via new helper can_score_for().
--   * READ  — "scores select gating per mode" calls same_flight_or_solo(), whose
--     solo branch only matched the literal game_mode='stableford' (0031), so
--     every OTHER solo format fell through to own-scores-only during live play.
--     Generalised to a structural NULL-flight check.
--
-- Rule (owner-decided 2026-06-08):
--   WRITE: a player may enter another player's score when they share an assigned
--     flight (classic best-ball gating — unchanged), OR neither has a flight AND
--     the game has <= 4 active players (one physical group keeping score
--     together). The <=4 bound stops a large flight-less event (e.g. a club
--     stableford) from becoming an open free-for-all; assign flights to define
--     groups there.
--   READ: in a flight-less (solo) game, all participants see each other during
--     active play. This honours the existing 0031 intent ("hele game-listen er
--     én flat konkurranse — alle game-medlemmer skal kunne se hverandre"),
--     extended from stableford to every solo format. Capped only by the
--     game-level score_visibility toggle: 'live' shows from hole 1, 'reveal'
--     still hides netto until finish (the reveal branch is unaffected).
--
-- Regression-free: best_ball and every team format have non-null flights, so the
-- flight-less branches never fire for them; no team format uses
-- game_mode='stableford' (par-stableford 4BBB is unimplemented). same_flight()
-- is left in place (strict equality) in case other code references it.

-- ── WRITE: can_score_for() ───────────────────────────────────────────────────
create or replace function public.can_score_for(p_game_id uuid, p_other_user uuid)
  returns boolean
  language sql security definer stable
  as $$
    select exists(
      select 1
      from public.game_players me
      join public.game_players them
        on me.game_id = them.game_id
      where me.game_id = p_game_id
        and me.user_id = auth.uid()
        and them.user_id = p_other_user
        and (
          -- (a) same assigned flight (best-ball / team formats)
          (me.flight_number is not null and me.flight_number = them.flight_number)
          -- (b) flight-less single group of <= 4 active players
          or (
            me.flight_number is null
            and them.flight_number is null
            and (
              select count(*) from public.game_players gp
              where gp.game_id = p_game_id and gp.withdrawn_at is null
            ) <= 4
          )
        )
    );
  $$;

drop policy if exists "scores insert by flight" on public.scores;
create policy "scores insert by flight" on public.scores
  for insert with check (
    public.is_admin()
    or (
      exists(select 1 from public.games g where g.id = public.scores.game_id and g.status = 'active')
      and entered_by = auth.uid()
      and (user_id = auth.uid() or public.can_score_for(public.scores.game_id, public.scores.user_id))
      and not exists(
        select 1 from public.game_players gp
        where gp.game_id = public.scores.game_id
          and gp.user_id = public.scores.user_id
          and (gp.submitted_at is not null or gp.withdrawn_at is not null)
      )
    )
  );

drop policy if exists "scores update by flight" on public.scores;
create policy "scores update by flight" on public.scores
  for update using (
    public.is_admin()
    or (
      exists(select 1 from public.games g where g.id = public.scores.game_id and g.status = 'active')
      and (user_id = auth.uid() or public.can_score_for(public.scores.game_id, public.scores.user_id))
      and not exists(
        select 1 from public.game_players gp
        where gp.game_id = public.scores.game_id
          and gp.user_id = public.scores.user_id
          and (gp.submitted_at is not null or gp.withdrawn_at is not null)
      )
    )
  ) with check (entered_by = auth.uid() or public.is_admin());

-- ── READ: generalise same_flight_or_solo() to structural NULL flights ────────
-- Keeps classic same-flight visibility; the solo branch now matches ANY
-- flight-less game instead of the literal game_mode='stableford'.
create or replace function public.same_flight_or_solo(p_game_id uuid, p_other_user uuid)
  returns boolean
  language sql security definer stable
  as $$
    select exists(
      select 1
      from public.games g
      join public.game_players me on me.game_id = g.id
      join public.game_players them on them.game_id = g.id
      where g.id = p_game_id
        and me.user_id = auth.uid()
        and them.user_id = p_other_user
        and (
          -- Classic: same assigned flight (both flight_number set + equal)
          (me.flight_number is not null and me.flight_number = them.flight_number)
          -- Solo: flight-less game — all participants see each other
          or (me.flight_number is null and them.flight_number is null)
        )
    );
  $$;
