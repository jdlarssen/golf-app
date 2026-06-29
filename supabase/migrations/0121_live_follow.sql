-- 0121_live_follow.sql
-- Issue #938 — Live-følg / spectate-modus.
--
-- Two schema changes for the live-follow feature:
--   A. Widen the scores SELECT policy so that in a LIVE-mode, active game every
--      participant sees ALL flights live (cross-flight), not just their own flight.
--      This mirrors the existing reveal-mode branch. Reveal-mode is left untouched
--      (the dramatic netto-reveal stays per-flight until the game finishes).
--   B. Add games.spectate_token — an unguessable, nullable token. When the creator
--      enables live-follow it is set to a random uuid; the public /spectate/<token>
--      route reads the game via the admin (service-role) client behind this token.
--      RLS stays closed for anon — no anonymous read surface is opened on scores.

-- ---------------------------------------------------------------------------
-- A. scores SELECT: add the live-mode cross-flight branch
-- ---------------------------------------------------------------------------
-- Existing branches are reproduced verbatim (perf form `(select auth.uid())`,
-- per 0092) with one new OR-branch appended.
alter policy "scores select gating per mode" on public.scores
  using (
    is_admin()
    -- finished + participant → all scores
    or (exists (select 1 from public.games g
                where g.id = scores.game_id and g.status = 'finished'::game_status)
        and exists (select 1 from public.game_players gp
                    where gp.game_id = scores.game_id and gp.user_id = (select auth.uid())))
    -- reveal-mode active + participant → all scores (view layer hides netto)
    or (exists (select 1 from public.games g
                where g.id = scores.game_id and g.status = 'active'::game_status
                  and g.score_visibility = 'reveal'::text)
        and exists (select 1 from public.game_players gp
                    where gp.game_id = scores.game_id and gp.user_id = (select auth.uid())))
    -- NEW (#938): live-mode active + participant → all flights live (cross-flight)
    or (exists (select 1 from public.games g
                where g.id = scores.game_id and g.status = 'active'::game_status
                  and g.score_visibility = 'live')
        and exists (select 1 from public.game_players gp
                    where gp.game_id = scores.game_id and gp.user_id = (select auth.uid())))
    -- own scores always
    or (user_id = (select auth.uid()))
    -- same-flight / solo (covers non-active states + solo games)
    or same_flight_or_solo(game_id, user_id)
  );

-- ---------------------------------------------------------------------------
-- B. games.spectate_token — opt-in public live-follow link
-- ---------------------------------------------------------------------------
alter table public.games
  add column if not exists spectate_token uuid;

comment on column public.games.spectate_token is
  'Unguessable token for the public read-only live-follow page (#938). NULL = live-follow disabled. Read server-side via the admin client; no anon RLS is opened.';

-- Unique only among enabled games; NULLs (disabled) are unconstrained.
create unique index if not exists games_spectate_token_key
  on public.games (spectate_token)
  where spectate_token is not null;
