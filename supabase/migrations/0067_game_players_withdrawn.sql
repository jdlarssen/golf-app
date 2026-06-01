-- 0067_game_players_withdrawn.sql
-- WD / «trekk spiller» (#386): markér at en spiller trakk seg / dro / aldri
-- møtte opp under et aktivt spill, så scorene deres ikke teller i rangeringen.
--
-- Avledet tilstand (ingen status-enum): withdrawn_at satt = trukket («WD»).
-- Additiv + nullable — alle eksisterende rader får null = ikke trukket, så
-- ingen oppførsels-endring før koden begynner å lese kolonnen. Trygg å kjøre
-- FØR kode-deploy.
--
-- Mutasjoner (self-WD, admin-WD, angre) går via server-actions med admin-client
-- (samme mønster som withdrawFromGame / approval-action, #198/#199). Ingen ny
-- bruker-vendt UPDATE-policy: default-deny RLS hindrer direkte klient-skriving,
-- og en bred UPDATE-policy ville over-permisjonere (team_number/handicap).

alter table public.game_players
  add column withdrawn_at timestamptz,
  add column withdrawn_by_user_id uuid references public.users(id);

comment on column public.game_players.withdrawn_at is
  'WD (#386): satt = spilleren trakk seg / ble trukket under aktivt spill. '
  'Scorene ekskluderes fra rangeringen; raden + scorer består («Trukket»). '
  'Null = ikke trukket. Angre = sett tilbake til null.';

comment on column public.game_players.withdrawn_by_user_id is
  'Hvem som trakk spilleren (self = spilleren selv, ellers arrangøren). Audit.';
