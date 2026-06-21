-- 0108_guard_withdrawn_columns_self_update.sql
--
-- Security hardening (#802): `guard_game_players_self_update` (first introduced
-- in migration 0103, extended in 0107) locked approved_*, team_number,
-- flight_number and course_handicap on the own-row path — but omitted
-- withdrawn_at and withdrawn_by_user_id. A logged-in participant could therefore
-- self-PATCH their own withdrawn_at via a direct PostgREST request, which lets
-- them:
--   • Override an admin-set withdrawal (restore their own standing)
--   • Self-withdraw from modes that do not support withdrawal (the app gates this
--     via supportsWithdrawal, but the DB had no guard)
--   • Clear their own withdrawal to rejoin scoring and league standings
--
-- Fix: CREATE OR REPLACE the trigger function, adding withdrawn_at and
-- withdrawn_by_user_id to the self-row denylist. The function body is otherwise
-- unchanged from 0107 — the trigger and peer-approval logic are untouched.
--
-- Bypasses (unchanged from 0107 / 0103):
--   • auth.uid() IS NULL (service-role / internal writes) → no-op
--   • public.is_admin() → no-op
--   • game creator acting on ANOTHER player's row → creator bypass preserved
--   • peer acting on ANOTHER player's row → allowlist of approval cols unchanged

create or replace function public.guard_game_players_self_update()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
as $$
  declare
    v_uid uuid := auth.uid();
    v_status public.game_status;
    v_is_creator boolean;
  begin
    if v_uid is null or public.is_admin() then
      return new;
    end if;

    if new.user_id = v_uid then
      -- Self-approval guard (0103)
      if new.approved_at is distinct from old.approved_at
         or new.approved_by_user_id is distinct from old.approved_by_user_id then
        raise exception
          'A player cannot approve their own scorecard (game_players.approved_at/approved_by_user_id)'
          using errcode = 'insufficient_privilege';
      end if;

      -- Grouping guard (0107): admin/creator-controlled columns
      if new.team_number is distinct from old.team_number
         or new.flight_number is distinct from old.flight_number then
        raise exception
          'A player cannot change their own team_number/flight_number (game_players grouping is admin/creator-controlled)'
          using errcode = 'insufficient_privilege';
      end if;

      -- Withdrawal guard (#802): only admin/creator may set or clear withdrawn_at.
      -- This closes the hole where a player could self-revoke an admin-set withdrawal
      -- or self-withdraw from a mode that does not support withdrawal.
      if new.withdrawn_at is distinct from old.withdrawn_at
         or new.withdrawn_by_user_id is distinct from old.withdrawn_by_user_id then
        raise exception
          'A player cannot set or clear their own withdrawn_at/withdrawn_by_user_id (game_players withdrawal is admin-controlled)'
          using errcode = 'insufficient_privilege';
      end if;

      -- Handicap guard (0103): locked once game has started
      if new.course_handicap is distinct from old.course_handicap then
        select g.status into v_status
          from public.games g
         where g.id = new.game_id;

        if v_status in ('active', 'finished') then
          raise exception
            'A player cannot change their own course_handicap after the game has started (game_players.course_handicap)'
            using errcode = 'insufficient_privilege';
        end if;
      end if;
    else
      -- Another player's row. Admin already returned above. The game CREATOR
      -- keeps full access (mirrors the "game_players creator update" policy) so
      -- roster edits (handicap/team/flight/withdrawal via the cookie client) still work.
      select (g.created_by = v_uid) into v_is_creator
        from public.games g where g.id = new.game_id;
      if coalesce(v_is_creator, false) then
        return new;
      end if;

      -- A true peer may change ONLY the approval columns. Allowlist via jsonb diff
      -- so future columns are protected by default.
      if (to_jsonb(new) - 'approved_at' - 'approved_by_user_id'
                        - 'rejection_reason' - 'submitted_at')
         is distinct from
         (to_jsonb(old) - 'approved_at' - 'approved_by_user_id'
                        - 'rejection_reason' - 'submitted_at') then
        raise exception
          'A peer may only change approval columns (approved_at, approved_by_user_id, rejection_reason, submitted_at) on another player''s row'
          using errcode = 'insufficient_privilege';
      end if;
    end if;

    return new;
  end;
$$;

-- Trigger already exists (created in 0103, function replaced in 0107 and now again
-- here). DROP + CREATE ensures it stays BEFORE UPDATE FOR EACH ROW.
drop trigger if exists guard_game_players_self_update on public.game_players;
create trigger guard_game_players_self_update
  before update on public.game_players
  for each row execute function public.guard_game_players_self_update();
