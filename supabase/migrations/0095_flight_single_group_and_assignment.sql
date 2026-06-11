-- 0095_flight_single_group_and_assignment.sql
-- Issue #543: flight = én gruppe ved ≤4 spillere + flight-inndeling for store spill.
--
-- Eier-beslutning 2026-06-11:
--   «≤4 aktive = én fysisk flight uansett format; wolf alltid én gruppe»
--
-- Supersedes the NULL-only branch in 0088 (coscore_flightless_small_games):
-- That migration allowed co-scoring only when BOTH players had flight_number IS NULL
-- AND the game had ≤4 active players. This blocked:
--   (a) matchplay sides: flight_number = side (1 or 2), so cross-side co-scoring
--       was denied even in a 2-player singles match.
--   (b) foursomes/texas with 4 players: all in one physical group but different
--       team/flight values → cross-team scoring denied.
--   (c) wolf: 3-5 players always one group, but flight-less by design → already
--       worked for ≤4; now explicit.
--
-- New rule (applies to BOTH helpers):
--   Single-flight game = active (withdrawn_at IS NULL) player count ≤ 4
--                        OR game_mode = 'wolf'
--   In single-flight games, co-scoring and live-score visibility are unrestricted
--   regardless of flight_number values (null or non-null).
--   For >4-player games, the classic same-assigned-flight branch is unchanged.
--
-- ── DB constraint changes ─────────────────────────────────────────────────────
--
-- 1. game_players_team_flight_consistency (0030):
--    Old: (team_number IS NULL) = (flight_number IS NULL)  ← team and flight
--         must both be null or both be non-null.
--    New: (team_number IS NULL) OR (flight_number IS NOT NULL)
--         Lag (team) still requires a flight; flight WITHOUT a team becomes
--         legal. This is needed so solo-format flight assignment (team = null,
--         flight = 1/2/3) does not violate the constraint.
--
-- 2. game_players_flight_number_check (0030, originally in 0001):
--    Old: flight_number IS NULL OR flight_number BETWEEN 1 AND 4
--    New: flight_number IS NULL OR flight_number >= 1
--         App-layer validates the upper bound; club scale needs up to ~38
--         flights (150 players / 4 per group). team_number retains its 1-4
--         bound (team slots are always a small fixed set per format).
--
-- 3. New column: games.signups_closed_at TIMESTAMPTZ NULL
--    Admin can close signups manually (Design B.4 / «Steng påmelding»).
--    NULL = open; non-null = closed at that timestamp. Signup page treats
--    this the same as a locked game (gameLocked pattern from #544).

-- ── 1. Replace game_players_team_flight_consistency ──────────────────────────
alter table public.game_players
  drop constraint if exists game_players_team_flight_consistency;

alter table public.game_players
  add constraint game_players_team_flight_consistency
    check ((team_number is null) or (flight_number is not null));

-- ── 2. Widen flight_number CHECK (remove upper bound) ────────────────────────
alter table public.game_players
  drop constraint if exists game_players_flight_number_check;

alter table public.game_players
  add constraint game_players_flight_number_check
    check (flight_number is null or flight_number >= 1);

-- ── 3. Add games.signups_closed_at ───────────────────────────────────────────
alter table public.games
  add column if not exists signups_closed_at timestamptz;

comment on column public.games.signups_closed_at is
  '#543: tidspunkt arrangøren stengte påmeldingen manuelt. null = åpen. '
  'Signup-siden behandler non-null som gameLocked (viser stengt-melding, '
  'skjuler skjema). Gir arrangøren ro til å justere flighter før tee-tid.';

-- ── 4. WRITE: can_score_for() ─────────────────────────────────────────────────
-- Replaces the 0088 version. New branch (b): allow when the game is
-- «single-flight» — active player count ≤ 4 OR game_mode = 'wolf' —
-- regardless of flight_number values. This lets:
--   • matchplay sides (flight = 1 or 2) enter each other's scores in 2-player
--     or 4-player matches.
--   • solo formats ≤4 continue to work as before (both null, ≤4 active).
--   • wolf (3-5 players, always one group) co-score freely.
-- Branch (a) (same assigned flight) is unchanged for >4-player games.
create or replace function public.can_score_for(p_game_id uuid, p_other_user uuid)
  returns boolean
  language sql security definer stable
  as $$
    select exists(
      select 1
      from public.game_players me
      join public.game_players them
        on me.game_id = them.game_id
      join public.games g
        on g.id = me.game_id
      where me.game_id = p_game_id
        and me.user_id = auth.uid()
        and them.user_id = p_other_user
        and me.withdrawn_at is null
        and them.withdrawn_at is null
        and (
          -- (a) same assigned flight (best-ball / team formats with >4 players)
          (me.flight_number is not null and me.flight_number = them.flight_number)
          -- (b) single-flight game: ≤4 active players OR wolf — all can co-score
          or (
            g.game_mode = 'wolf'
            or (
              select count(*) from public.game_players gp
              where gp.game_id = p_game_id and gp.withdrawn_at is null
            ) <= 4
          )
        )
    );
  $$;

-- ── 5. READ: same_flight_or_solo() ───────────────────────────────────────────
-- Replaces the 0088 version. Generalises the solo branch: in a single-flight
-- game (≤4 active players OR wolf), all participants see each other's scores
-- live. The classic same-flight branch (both assigned, equal) is unchanged
-- for >4-player games with flights set.
-- Reveal-mode (score_visibility = 'reveal') hides netto until finish via a
-- separate branch in the SELECT policy — unaffected here.
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
          -- (a) Classic: same assigned flight (both flight_number set + equal)
          (me.flight_number is not null and me.flight_number = them.flight_number)
          -- (b) Solo/single-flight: either both flight-less, or it's a
          --     single-flight game (≤4 active or wolf) → all see each other
          or (me.flight_number is null and them.flight_number is null)
          or (
            g.game_mode = 'wolf'
            or (
              select count(*) from public.game_players gp
              where gp.game_id = g.id and gp.withdrawn_at is null
            ) <= 4
          )
        )
    );
  $$;
