-- 0117_game_players_score_differential.sql
--
-- #941: WHS score-differential — fryses per runde ved avslutning.
--
-- Lagrer differensialen én gang når et spill avsluttes. Kopieres aldri
-- retroaktivt av migrasjonsskript; historikk-siden lazy-fryser eldre runder
-- organisk via after()-mønsteret. Verdien beregnes utelukkende i TypeScript
-- (lib/scoring/scoreDifferential.ts) — formelen lever ett sted.
--
-- Kolonnen er nullable: runder med < 18 scorede hull, manglende slope/CR eller
-- course_handicap får NULL og hoppes over i trending-grafen. Positive og
-- negative differensialer er begge gyldige (pluss-hcp / lett bane).
--
-- Skrivevakt: kun service-rollen (auth.uid() IS NULL) og globale admins
-- (public.is_admin()) kan sette score_differential. En spiller som forsøker
-- å PATCH sin egen rad for å justere differensialen (og dermed fremstå bedre)
-- blokkeres av guard_game_players_score_differential — samme hostile-PATCH-
-- forsvar som 0103/0107 etablerer for approved_at, course_handicap og
-- team_number/flight_number.
--
-- Triggeren er additiv: guard_game_players_self_update (0103/0107) røres ikke.
-- Begge triggere kjøres ved BEFORE UPDATE; Postgres kjører dem i navnerekkefølge.

alter table public.game_players
  add column score_differential numeric(4,1);

comment on column public.game_players.score_differential is
  '#941: WHS score-differensial (1 desimal) for denne runden, frosset ved spillets avslutning. NULL betyr at runden ikke kvalifiserer (< 18 hull, manglende slope/CR/course_handicap). Skrives utelukkende av service-rollen via persistScoreDifferentials — aldri av innloggede spillere.';

-- ── Guard-trigger-funksjon ─────────────────────────────────────────────────────
-- SECURITY DEFINER so is_admin() (which reads public.users) runs with definer
-- privileges, consistent with guard_game_players_self_update (0103/0107).
-- This function is intentionally separate from guard_game_players_self_update
-- so that it remains additive and each guard is independently auditable.
create or replace function public.guard_game_players_score_differential()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''  -- hardened: every reference below is schema-qualified
  as $$
  begin
    -- Service-role (admin client: persistScoreDifferentials at game finish) carries
    -- no JWT sub → auth.uid() is NULL. Pass through unchanged. Global admins
    -- (is_admin()) have full access per RLS and are also exempt.
    if auth.uid() is null or public.is_admin() then
      return new;
    end if;

    -- A non-admin authenticated player must never change score_differential on
    -- any row — the value is set once by the system at finish time and must remain
    -- immutable to preserve the frozen-differential guarantee (#941).
    if new.score_differential is distinct from old.score_differential then
      raise exception
        'score_differential is set by the system at game finish and cannot be changed by a player (game_players.score_differential)'
        using errcode = 'insufficient_privilege';  -- SQLSTATE 42501
    end if;

    return new;
  end;
  $$;

comment on function public.guard_game_players_score_differential() is
  '#941: blocks any non-admin authenticated user from writing game_players.score_differential. The value is frozen at game finish by the service role (persistScoreDifferentials). No-ops for the service role (auth.uid() IS NULL) and global admins (is_admin()). Additive to guard_game_players_self_update (0103/0107).';

-- ── Trigger ───────────────────────────────────────────────────────────────────
-- BEFORE UPDATE without an OF column list: the function checks is distinct from
-- itself (consistent with 0103/0107 style) and covers all write paths uniformly.
drop trigger if exists guard_game_players_score_differential on public.game_players;
create trigger guard_game_players_score_differential
  before update on public.game_players
  for each row
  execute function public.guard_game_players_score_differential();
