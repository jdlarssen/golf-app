-- 0193 (#2284): a side-tournament winner must be an active player in the game.
--
-- The finish page lists only active players as LD/CTP winner candidates
-- (lib/games/finishRoster.ts on web, native/app/src/lib/endGamePlan.ts in the
-- app). A player who withdraws while the organiser has the page open is still
-- in the stale list, and nothing stopped the pick from being saved: the finish
-- then flipped the game and sent «Resultatet er klart» with a withdrawn winner.
-- The owner's answer 2026-09-27: «Nei, sperr også lagringen.»
--
-- Why the rule lives HERE and not in TypeScript: exactly two places write
-- game_side_winners, and they share no code. The web finish goes through
-- lib/games/endGameCore.ts (server-only); the app upserts straight through
-- PostgREST with the user's JWT (native/app/src/data/endGame.ts). The table is
-- the only thing both touch, and a check in endGameCore alone would let the app
-- and any direct PostgREST POST past it (AGENTS.md trap 3).
--
-- Shape:
--   * BEFORE INSERT OR UPDATE OF winner_user_id, game_id. An upsert hits BEFORE
--     INSERT on the attempt and BEFORE UPDATE on conflict, so both are covered.
--     The whole upsert is one statement: one bad row rolls back every row in
--     the batch, and the finish (winners before the status flip on both
--     surfaces) leaves the game `active`.
--   * winner_user_id = null («Ingen kvalifiserte») passes.
--   * No escape for the service role or admins: nothing legitimate ever crowns
--     a withdrawn player or a stranger.
--   * security definer: the check must not depend on whether the caller's
--     game_players SELECT policy shows the row (an organiser who does not play,
--     #2213). It reads one boolean and returns no data.
--   * The error follows 0176: SQLSTATE P0001 with a machine-readable message.
--     lib/games/sideWinnerGuard.ts is the one place both clients recognise it.
--
-- No backfill: the trigger only guards new writes. A winner row saved before a
-- later withdrawal stays until the next finish attempt overwrites it.
--
-- Order against deploy: safe both ways. Trigger before the code → the old
-- generic «Klarte ikke å lagre vinnerne»; code before the trigger → the new
-- branch simply never fires.

create or replace function public.game_side_winners_active_winner_guard()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
as $$
  begin
    if new.winner_user_id is not null and not exists (
      select 1
        from public.game_players gp
       where gp.game_id = new.game_id
         and gp.user_id = new.winner_user_id
         and gp.withdrawn_at is null
    ) then
      raise exception 'side_winner_not_active'
        using
          errcode = 'P0001',
          detail  = 'The side-tournament winner is withdrawn or not a player in this game.',
          hint    = 'Reload the finish page and pick an active player.';
    end if;

    return new;
  end;
$$;

-- Trigger functions are called by the trigger machinery, which does not check
-- EXECUTE (0137, 0179). Remove the client surface so it is not on /rest/v1/rpc.
revoke execute on function public.game_side_winners_active_winner_guard() from public, anon, authenticated;

drop trigger if exists game_side_winners_active_winner_guard on public.game_side_winners;
create trigger game_side_winners_active_winner_guard
  before insert or update of winner_user_id, game_id on public.game_side_winners
  for each row execute function public.game_side_winners_active_winner_guard();
