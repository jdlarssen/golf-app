-- 0220_league_marker.sql
-- =============================================================================
-- #2661 - in a simulator league the player names a marker when they deliver
-- the card, and the marker approves it before the round counts (the owner,
-- 2026-10-27: «hver person må velge en annen person som markør når de skal
-- sende inn, så må den andre personen godkjenne»).
--
-- The marker is another member of the league, usually not in the flight at
-- all: every player plays their own round in Tørny, also when several stand
-- in the same simulator. RLS on games/game_players/scores only lets the
-- players in a game see it, so the marker reads and approves the card through
-- the server (lib/league/markerReviewAccess.ts, service role). This migration
-- does not widen any select policy.
--
-- Additive: the old code never reads the new column or writes the new kind,
-- so this migration goes on BEFORE the code deploys. Without it the new code
-- fails every delivery in a simulator league (the marker write names an
-- unknown column), and the marker's notice is refused by the CHECK.
--
-- 1. game_players.marker_user_id: who the player asked to approve this card.
--    Same FK form as approved_by_user_id / submitted_by_user_id (users(id),
--    no cascade: anonymize_user scrubs the users row and never deletes it).
--    Indexed like its siblings in 0091 and 0191. Null outside simulator
--    leagues.
--
-- 2. guard_game_players_league_marker, one trigger with two jobs:
--    - The column is server-owned: only the service role (auth.uid() is null:
--      lib/league/setFlightMarkerCore.ts) and a global admin set or change
--      it. A player who PATCHes their own row, or a game creator who PATCHes
--      a flightmate's row, is refused. Same rule as games.league_round_id
--      (0186, guard_games_league_round_id).
--    - In a simulator-league flight a card is approved by its marker, the
--      league's organiser or a global admin, all through the server. A
--      signed-in non-admin who sets approved_at there is refused, so a
--      flightmate (can_score_for, 0106) or the player who started the flight
--      (the game creator) cannot approve a card by a direct PATCH either. The
--      rule in TypeScript is mayApproveAsMarker (lib/league/leagueMarker.ts).
--      Clearing an approval (reject, reopen) is never checked.
--    Its own trigger, not part of guard_game_players_self_update, so a
--    rollback is one drop.
--
-- 3. A new kind in the kind CHECK, same drop/re-add as 0203, 0204 and 0217:
--    'league_marker_request' («Anders ber deg godkjenne runden»). Payload
--    shape is validated in lib/notifications/types.ts, and
--    lib/notifications/kindCheckParity.test.ts holds the list equal to the TS
--    union.
-- =============================================================================

alter table public.game_players
  add column marker_user_id uuid references public.users(id);

comment on column public.game_players.marker_user_id is
  '#2661: the league member the player asked to approve this card in a simulator league. Set by the server when the card is delivered (guard_game_players_league_marker); null elsewhere.';

create index if not exists game_players_marker_user_id_idx
  on public.game_players (marker_user_id);

create or replace function public.guard_game_players_league_marker()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
  declare
    v_simulator boolean;
  begin
    if auth.uid() is null or public.is_admin() then
      return new;
    end if;

    if tg_op = 'INSERT' then
      if new.marker_user_id is not null then
        raise exception
          'marker_user_id is set by the server when the card is delivered (game_players.marker_user_id)'
          using errcode = 'insufficient_privilege';  -- SQLSTATE 42501
      end if;
      return new;
    end if;

    if new.marker_user_id is distinct from old.marker_user_id then
      raise exception
        'marker_user_id is set by the server when the card is delivered (game_players.marker_user_id)'
        using errcode = 'insufficient_privilege';  -- SQLSTATE 42501
    end if;

    if new.approved_at is not null
       and new.approved_at is distinct from old.approved_at then
      select l.is_simulator into v_simulator
        from public.games g
        join public.league_rounds r on r.id = g.league_round_id
        join public.leagues l on l.id = r.league_id
       where g.id = old.game_id;
      if coalesce(v_simulator, false) then
        raise exception
          'In a simulator league the marker approves the card through the server (game_players.approved_at)'
          using errcode = 'insufficient_privilege';  -- SQLSTATE 42501
      end if;
    end if;

    return new;
  end;
  $$;

comment on function public.guard_game_players_league_marker() is
  '#2661: BEFORE INSERT/UPDATE on game_players. Only the service role and a global admin set or change marker_user_id, and only they set approved_at on a card in a simulator-league flight (the marker approves through the server).';

revoke execute on function public.guard_game_players_league_marker() from public, anon, authenticated;

create trigger guard_game_players_league_marker
  before insert or update on public.game_players
  for each row execute function public.guard_game_players_league_marker();

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in (
    'invite',
    'peer_approval_request',
    'scorecard_submitted',
    'scorecard_approved',
    'scorecard_rejected',
    'scorecard_reopened',
    'game_finished',
    'game_reopened',
    'product_update',
    'team_invite',
    'registration_request',
    'registration_approved',
    'registration_rejected',
    'registration_expired',
    'team_member_withdrew',
    'deliver_reminder',
    'cup_finished',
    'cup_started',
    'club_join_request',
    'club_role_changed',
    'friend_request',
    'friend_accepted',
    'player_added',
    'game_started',
    'auto_start_blocked',
    'achievement_unlocked',
    'idea_built',
    'payment_reminder',
    'cup_signup',
    'cup_lineup_revealed',
    'missing_score_reminder',
    'all_scorecards_delivered',
    'game_stale_reminder',
    'league_round_open',
    'league_round_closing',
    'league_marker_request'
  ));
