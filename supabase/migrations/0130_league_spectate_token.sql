-- 0130_league_spectate_token.sql
-- Issue #1024 — Liga-tabellen som embed på klubbens nettside.
--
-- Adds leagues.spectate_token, mirroring games.spectate_token (0121, #938):
-- an unguessable, nullable token. When the league admin enables the embed it
-- is set to a random uuid; the public /embed/liga/<token> route reads the
-- league via the admin (service-role) client behind this token. RLS stays
-- untouched — no anonymous read surface is opened on leagues.

alter table public.leagues
  add column if not exists spectate_token uuid;

comment on column public.leagues.spectate_token is
  'Unguessable token for the public embeddable standings page (#1024). NULL = embed disabled. Read server-side via the admin client; no anon RLS is opened.';

-- Unique only among enabled leagues; NULLs (disabled) are unconstrained.
create unique index if not exists leagues_spectate_token_key
  on public.leagues (spectate_token)
  where spectate_token is not null;
