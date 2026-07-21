-- 0147_restore_self_update_guards.sql
--
-- Security fix (#1321): 0133 rebuilt guard_game_players_self_update() from the
-- 0103 body shape (+ its new paid_at guard) instead of the then-current 0108
-- shape, silently dropping two guards on the own-row path:
--   • team_number / flight_number (added by 0107 — self-reflighting drives
--     can_score_for and peer approval)
--   • withdrawn_at / withdrawn_by_user_id (added by 0108, #802 — self-
--     withdrawing, or clearing an admin-set withdrawal to re-enter scoring)
-- Because 0133 is CREATE OR REPLACE, the regression shipped to prod with it.
-- Caught by the migrations-gate pgTAP run 2026-07-21 (issue #1321): the
-- withdrawn/grouping asserts went red against a fresh migration-built DB
-- while RLS in the same statements worked — proving the function body, not
-- the policies, had lost the rules.
--
-- This body is the UNION of every guard shipped so far: approved_* (0103),
-- grouping (0107), withdrawn_* (0108), course_handicap (0103), paid_at
-- (0133). The other's-row branch (creator bypass + peer allowlist, #704) is
-- byte-identical in 0108 and 0133 and unchanged here. Trap-4 note ("a rule
-- has one home"): when touching this function again, copy the body from the
-- LATEST create-or-replace, never from an older migration — the pgTAP suites
-- in supabase/tests/ are the parity net that catches the next fork.
--
-- ACLs: CREATE OR REPLACE preserves existing function grants, so 0137's
-- revoke (execute from public/anon/authenticated) survives both here and in
-- fresh sequential builds.

create or replace function public.guard_game_players_self_update()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''  -- hardened: every reference below is schema-qualified
  as $$
  declare
    v_uid uuid := auth.uid();
    v_status public.game_status;
    v_is_creator boolean;
  begin
    -- Service role (admin client: startGame, signup, flight-join) has no JWT
    -- sub → auth.uid() is NULL: pass through. Admin (is_admin) has full
    -- access per RLS: pass through. Both escapes first.
    if v_uid is null or public.is_admin() then
      return new;
    end if;

    if new.user_id = v_uid then
      -- ── OWN row ──────────────────────────────────────────────────────────
      -- (a) Self-approval (0103, #670).
      if new.approved_at is distinct from old.approved_at
         or new.approved_by_user_id is distinct from old.approved_by_user_id then
        raise exception
          'A player cannot approve their own scorecard (game_players.approved_at/approved_by_user_id)'
          using errcode = 'insufficient_privilege';  -- SQLSTATE 42501
      end if;

      -- (b) Grouping (0107): team/flight are admin/creator-controlled — a
      -- player must not re-flight themselves or split into a phantom team.
      if new.team_number is distinct from old.team_number
         or new.flight_number is distinct from old.flight_number then
        raise exception
          'A player cannot change their own team_number/flight_number (game_players grouping is admin/creator-controlled)'
          using errcode = 'insufficient_privilege';  -- SQLSTATE 42501
      end if;

      -- (c) Withdrawal (0108, #802): only admin/creator may set or clear
      -- withdrawn_at — closes self-revoking an admin-set withdrawal and
      -- self-withdrawing from modes without withdrawal support.
      if new.withdrawn_at is distinct from old.withdrawn_at
         or new.withdrawn_by_user_id is distinct from old.withdrawn_by_user_id then
        raise exception
          'A player cannot set or clear their own withdrawn_at/withdrawn_by_user_id (game_players withdrawal is admin-controlled)'
          using errcode = 'insufficient_privilege';  -- SQLSTATE 42501
      end if;

      -- (d) Self-handicap after start (0103, #670).
      if new.course_handicap is distinct from old.course_handicap then
        select g.status into v_status
          from public.games g
         where g.id = new.game_id;

        if v_status in ('active', 'finished') then
          raise exception
            'A player cannot change their own course_handicap after the game has started (game_players.course_handicap)'
            using errcode = 'insufficient_privilege';  -- SQLSTATE 42501
        end if;
      end if;

      -- (e) Self-payment (0133, #1049): only the organizer ticks paid_at.
      if new.paid_at is distinct from old.paid_at then
        raise exception
          'A player cannot mark their own payment status (game_players.paid_at)'
          using errcode = 'insufficient_privilege';  -- SQLSTATE 42501
      end if;
    else
      -- ── ANOTHER player's row ─────────────────────────────────────────────
      -- Admin already passed above. The game CREATOR keeps full roster access
      -- (mirrors the "game_players creator update" policy).
      select (g.created_by = v_uid) into v_is_creator
        from public.games g where g.id = new.game_id;
      if coalesce(v_is_creator, false) then
        return new;
      end if;

      -- A true peer may change ONLY the approval columns (#704). Allowlist
      -- via jsonb diff so future columns are protected by default.
      if (to_jsonb(new) - 'approved_at' - 'approved_by_user_id'
                        - 'rejection_reason' - 'submitted_at')
         is distinct from
         (to_jsonb(old) - 'approved_at' - 'approved_by_user_id'
                        - 'rejection_reason' - 'submitted_at') then
        raise exception
          'A peer may only change approval columns (approved_at, approved_by_user_id, rejection_reason, submitted_at) on another player''s row'
          using errcode = 'insufficient_privilege';  -- SQLSTATE 42501
      end if;
    end if;

    return new;
  end;
  $$;

comment on function public.guard_game_players_self_update() is
  '#670 + #704 + #802 + #1049 + #1321: blocks a non-admin player from self-'
  'approving, self-regrouping (team/flight), self-(un)withdrawing, editing own '
  'course_handicap post-start, or marking own paid_at (own row); restricts a '
  'non-admin peer to ONLY the approval columns on another player''s row. '
  'No-ops for admin, the game creator (another''s row), and the service role. '
  'When changing this body: copy from the LATEST create-or-replace (trap 4).';

-- Re-bind the trigger (idempotent — body swapped via create or replace).
drop trigger if exists guard_game_players_self_update on public.game_players;
create trigger guard_game_players_self_update
  before update on public.game_players
  for each row
  execute function public.guard_game_players_self_update();
