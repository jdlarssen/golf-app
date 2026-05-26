-- 0041_game_players_self_register_and_withdraw.sql
-- To nye RLS-policies på game_players for selv-påmelding (issue #199).
--
-- Eksisterende admin-only INSERT/UPDATE-policies (0002:85-86) er uendret.
-- Disse nye policy-ene legger til en bruker-side: spilleren kan inserte
-- egen rad i open-modus, og slette egen rad pre-start (selvtrekk).

-- INSERT: authenticated bruker kan opprette egen game_players-rad,
-- men kun når games.registration_mode = 'open' og spillet er pre-start.
-- manual_approval-flyten går ikke gjennom denne policy-en — approval-action
-- bruker admin-client og bypasser RLS som i #198-mønsteret.
create policy "game_players self register open"
  on public.game_players for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.games g
      where g.id = game_id
        and g.registration_mode = 'open'
        and g.status in ('draft', 'scheduled')
    )
  );

-- DELETE: spiller kan slette egen rad pre-active (selvtrekk).
-- Trigger eller server-action sender team_member_withdrew-notification
-- til kapteinen hvis user var lag-medlem.
create policy "game_players self withdraw pre active"
  on public.game_players for delete
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.games g
      where g.id = game_id
        and g.status in ('draft', 'scheduled')
    )
  );

comment on policy "game_players self register open" on public.game_players is
  'Selv-påmelding gated på games.registration_mode = open. manual_approval-flyten '
  'går via admin-client-bypass i godkjennings-action, ikke denne policy-en.';

comment on policy "game_players self withdraw pre active" on public.game_players is
  'Selvtrekk pre-start. team_member_withdrew-notification sendes fra server-action.';
