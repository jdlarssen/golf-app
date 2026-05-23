-- 0031_solo_visibility_rls.sql
-- Utvider score-visibility til å dekke solo-modus (der flight_number er null).
--
-- I best_ball_netto har spillere flight_number satt, og kan bare se andres
-- scores hvis de er i samme flight (under aktivt spill, ikke-reveal). I solo
-- stableford har spillere null flight, og hele game-listen er én flat
-- konkurranse — alle game-medlemmer skal kunne se hverandre under aktivt
-- spill (siden konkurransen uansett er individuell og full transparens
-- forventes).
--
-- Strategi: ny helper public.same_flight_or_solo() som beholder klassisk
-- flight-logikk MEN i tillegg returnerer true når g.game_mode = 'stableford'.
-- Den eksisterende "scores select gating"-policy droppes og recreates med
-- samme branches + samme reveal-håndtering, kun siste branch byttet fra
-- same_flight() til same_flight_or_solo().
--
-- same_flight() beholdes uendret — andre policies (scores insert/update)
-- bruker den fortsatt og skal beholde streng flight-gating for best-ball.

-- 1. Ny helper for combined flight-eller-solo-visibility
create or replace function public.same_flight_or_solo(p_game_id uuid, p_other_user uuid) returns boolean
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
          -- Klassisk: samme flight (begge må ha flight_number satt + likt)
          (me.flight_number is not null and me.flight_number = them.flight_number)
          -- Solo: alle game-medlemmer ser hverandre
          or g.game_mode = 'stableford'
        )
    );
  $$;

-- 2. Drop og recreate scores select-policy (siste navn: "scores select gating"
--    fra 0025_reveal_active_scores_visibility.sql)
drop policy if exists "scores select gating" on public.scores;

create policy "scores select gating per mode"
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
    or same_flight_or_solo(scores.game_id, scores.user_id)
  );
