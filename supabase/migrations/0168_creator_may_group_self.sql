-- 0168_creator_may_group_self.sql
--
-- #1855 (native N6b) / #1868: give the game's CREATOR the same own-row escape
-- for team_number/flight_number that they already have on every other player's
-- row — and that 0159 (#1362) already granted them for clearing their own
-- approval.
--
-- Found on staging while verifying «Start runden nå» from the native app. The
-- organiser was refused on exactly one row — their own:
--
--   SLOT_WRITE 069cda6e error: null
--   SLOT_WRITE 252e1a6f error: 42501 "A player cannot change their own
--                                     team_number/flight_number"
--   SLOT_WRITE 1f016c6a error: null
--
-- `startScheduledGameCore` draws Wolf/Round Robin rotation slots (#969) for
-- every active player, so a non-admin organiser who is also playing could not
-- start those formats at all from the app. Every web caller escapes the guard
-- for an unrelated reason (cron + E1 fallback are service-role; the admin
-- button requires is_admin(); the league path never enters the loop because
-- rotationSlotRange is null there), which is why this never surfaced before.
--
-- ⚠️ Trap 4, the hard way: the first cut of this migration copied 0147's body
-- because 0147's own comment says "copy from the LATEST create-or-replace" —
-- but 0147 is NOT the latest. 0159 is. That draft silently reverted #1362's
-- creator-reopen exception and shipped the regression to staging before review
-- caught it. The body below is 0159's, with ONLY guard (b) changed. When you
-- touch this function next: `grep -l guard_game_players_self_update
-- supabase/migrations/*.sql | tail -1` — do not trust a file's own claim to be
-- current.
--
-- Guards (a) self-approval + creator-reopen, (c) withdrawal, (d) post-start
-- course_handicap and (e) paid_at are untouched — a creator still cannot
-- withdraw themselves, which matches what the web does today.
--
-- ACLs: create-or-replace preserves 0137's revoke.

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
      -- (a) Self-approval (0103, #670), with ONE narrow exception (0159,
      -- #1362): the game's CREATOR may CLEAR their own approval — both
      -- columns to NULL — which is what reopening a scorecard does. SETTING
      -- an approval on one's own row stays forbidden for everyone, creator
      -- included, so a reopened card still needs someone else's approval.
      if new.approved_at is distinct from old.approved_at
         or new.approved_by_user_id is distinct from old.approved_by_user_id then
        select (g.created_by = v_uid) into v_is_creator
          from public.games g where g.id = new.game_id;

        if not (coalesce(v_is_creator, false)
                and new.approved_at is null
                and new.approved_by_user_id is null) then
          raise exception
            'A player cannot approve their own scorecard (game_players.approved_at/approved_by_user_id)'
            using errcode = 'insufficient_privilege';  -- SQLSTATE 42501
        end if;
      end if;

      -- (b) Grouping (0107): team/flight are admin/creator-controlled — a
      -- player must not re-flight themselves or split into a phantom team.
      --
      -- #1855/#1868: the game's CREATOR is exempt on their own row too, the
      -- same way 0159 exempts them for clearing their own approval. The
      -- guard's message has always said "admin/creator-controlled", and the
      -- other's-row branch below already gives the creator full roster
      -- access — the own-row path simply never got the matching escape.
      --
      -- Not a new privilege: the same creator may already re-team every OTHER
      -- player and add or delete any roster row pre-start. Load-bearing
      -- because `startScheduledGameCore` assigns Wolf/Round Robin rotation
      -- slots (#969) to every ACTIVE player, organiser included, so a
      -- non-admin organiser could not start those two formats from the native
      -- app at all. A true peer is still refused: the escape reads
      -- games.created_by.
      if new.team_number is distinct from old.team_number
         or new.flight_number is distinct from old.flight_number then
        select (g.created_by = v_uid) into v_is_creator
          from public.games g where g.id = new.game_id;

        if not coalesce(v_is_creator, false) then
          raise exception
            'A player cannot change their own team_number/flight_number (game_players grouping is admin/creator-controlled)'
            using errcode = 'insufficient_privilege';  -- SQLSTATE 42501
        end if;
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
  '#670 + #704 + #802 + #1049 + #1321 + #1362 + #1855: blocks a non-admin '
  'player from self-approving, self-(un)withdrawing, editing own '
  'course_handicap post-start, or marking own paid_at (own row), and from '
  'self-regrouping UNLESS they created the game; the creator may CLEAR their '
  'own approval (#1362 reopen) but never set it; restricts a non-admin peer to '
  'ONLY the approval columns on another player''s row. No-ops for admin, the '
  'game creator (another''s row), and the service role. When changing this '
  'body: copy from the LATEST create-or-replace — find it with grep, not from '
  'a file''s own claim (trap 4, #1855).';

-- Re-bind the trigger (idempotent — body swapped via create or replace).
drop trigger if exists guard_game_players_self_update on public.game_players;
create trigger guard_game_players_self_update
  before update on public.game_players
  for each row
  execute function public.guard_game_players_self_update();
