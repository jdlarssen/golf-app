-- 0221_league_join_code.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- #2662: a shareable link into a league without a club,
-- /liga/bli-med/<join_code>. Whoever opens it can log in or create an account
-- and join the league without the organiser adding them.
--
--   1. leagues.join_code — 8 characters [0-9a-z]. NULL = the link is off, the
--      same move as leagues.spectate_token (0130). createLeagueDraft sets it for
--      a league without a club; the organiser turns it off, on again (new code)
--      or rotates it (lib/league/joinLink.ts). The code is drawn in TS
--      (lib/league/joinCode.ts); the unique index catches a collision.
--   2. No new RLS. «leagues admin or club-admin update» (0092) covers the
--      organiser's writes, and the join writes league_players with the service
--      role behind evaluateLeagueJoin (lib/league/joinValidation.ts), like the
--      cup link (#1490). A participant who PATCHes join_code or INSERTs into
--      league_players directly is refused by the policies that exist.
--   3. guard_leagues_locked_fields is untouched: the link can be turned off and
--      on after the league has started.
--
-- Direction (what does OLD code do with this applied?): nothing changes. Old
-- code never reads or writes the column, and every existing league keeps
-- join_code NULL (no backfill: the organiser turns the link on).
-- supabase/tests/league_join_code_test.sql covers the CHECK and the policies.

alter table public.leagues
  add column join_code text null;

alter table public.leagues
  add constraint leagues_join_code_format
  check (join_code is null or join_code ~ '^[0-9a-z]{8}$');

-- Unique only among leagues whose link is on; NULLs (off) are unconstrained.
create unique index leagues_join_code_key
  on public.leagues (join_code)
  where join_code is not null;

comment on column public.leagues.join_code is
  'Code in the shareable join link /liga/bli-med/<code> (#2662). NULL = link off. Leagues without a club only. Written by lib/league/joinLink.ts and createLeagueDraft; the join reads it via the admin client.';
