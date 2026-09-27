-- 0186 (#2207): users.email and users.friend_code are private; a game's
-- league round link is set by the server only.
--
--   1. Column privileges on public.users. RLS decides WHICH rows a caller
--      sees (own row, admin, anyone sharing a game); from here on the two
--      identity columns are not among the columns `authenticated` and `anon`
--      may SELECT at all, not even on their own row. The server reads them
--      with the service role, for the caller's own row, admin pages behind
--      requireAdmin, and mail/notification sends
--      (lib/supabase/AGENTS.md, lib/users/privateUserFields.ts).
--      The column list is every other column of the live table
--      (information_schema.columns on staging, 2026-09-27). A NEW column on
--      public.users needs its own `grant select (column)`, or the app cannot
--      see it: supabase/tests/users_private_columns_test.sql goes red for a
--      column that is neither granted nor one of the two private ones.
--      UPDATE/INSERT grants are untouched. Writing a column does not need
--      SELECT on it, but a RETURNING or a WHERE on a column does: ask back
--      `id`, never `*`.
--   2. guard_games_league_round_id: a non-null, new or changed
--      games.league_round_id only from the service role or a global admin.
--      The league standings count finished games per round with the service
--      role; the flight start checks window, membership, marker and one
--      counted flight on the server and inserts through the admin client
--      (lib/league/actions.ts). Clearing the link (ON DELETE SET NULL when a
--      round goes) is never checked. Its own trigger, not part of 0185's, so
--      a rollback is one drop.
--
-- Direction (what does OLD code do with this applied?): it breaks. Old web
-- code reads users.email on the user's own session (the admin gate, the home
-- page, profile save, round start, league flights), and store builds up to
-- and including 1.1.0 (3) read it in the shared start core, so «Start
-- runden» fails there. LATE: production only after the new web code is
-- deployed AND the owner has decided about the store builds. Staging only in
-- a time-boxed window before merge, then for good after merge.

-- ── 1. Private columns on public.users ───────────────────────────────────────
revoke select on table public.users from anon, authenticated;

grant select (
  id,
  created_at,
  deleted_at,
  gender,
  handicap_updated_at,
  hcp_index,
  is_admin,
  is_guest,
  last_seen_at,
  level,
  locale,
  name,
  nickname,
  product_updates_unsubscribed_at,
  profile_completed_at
) on public.users to anon, authenticated;

-- ── 2. league_round_id is server-owned ───────────────────────────────────────
create or replace function public.guard_games_league_round_id()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
  as $$
  begin
    if auth.uid() is null or public.is_admin() then
      return new;
    end if;

    if tg_op = 'INSERT' then
      if new.league_round_id is not null then
        raise exception
          'league_round_id is set by the server when a league flight starts (games.league_round_id)'
          using errcode = 'insufficient_privilege';  -- SQLSTATE 42501
      end if;
      return new;
    end if;

    if new.league_round_id is not null
       and new.league_round_id is distinct from old.league_round_id then
      raise exception
        'league_round_id is set by the server when a league flight starts (games.league_round_id)'
        using errcode = 'insufficient_privilege';  -- SQLSTATE 42501
    end if;

    return new;
  end;
  $$;

comment on function public.guard_games_league_round_id() is
  '#2207: only the service role and global admins set a non-null games.league_round_id; clearing it is never checked. The flight start inserts through the admin client after its own server-side checks.';

drop trigger if exists guard_games_league_round_id on public.games;
create trigger guard_games_league_round_id
  before insert or update of league_round_id on public.games
  for each row
  execute function public.guard_games_league_round_id();

-- Trigger functions never need client-callable EXECUTE (0137/0150).
revoke execute on function public.guard_games_league_round_id() from public, anon, authenticated;
