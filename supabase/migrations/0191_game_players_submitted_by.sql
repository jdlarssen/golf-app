-- 0191 (#2200): who delivered a scorecard, and that person may not also
-- approve it.
--
-- The one who keeps score for the flight can now deliver the flightmates'
-- cards with their own (and a guest's card, which nobody could deliver
-- before). The organiser needs to see that a card was delivered by someone
-- else, so game_players gets `submitted_by_user_id`.
--
-- The database already let a flightmate set `submitted_at` on another
-- player's row: policy «game_players peer approve flightmate» (0106) is
-- `can_score_for(game_id, user_id)` for UPDATE, and the peer allowlist in
-- `guard_game_players_self_update` includes `submitted_at`. Both read on
-- staging 2026-09-27 before this migration was written. So this migration
-- widens nothing about WHO may deliver; `can_score_for` stays the rule.
--
-- What it adds:
--
-- 1. The column, same FK form as `approved_by_user_id` (users(id), no cascade:
--    anonymize_user scrubs the users row and never deletes it). Indexed like
--    its siblings in 0091.
--
-- 2. `game_players_set_submitted_by`, a BEFORE INSERT/UPDATE trigger that
--    owns the column for every signed-in caller:
--      - submitted_at becomes null (reopen, rejection)   → null
--      - submitted_at goes from null to a value           → auth.uid()
--      - anything else                                    → the old value
--    A client-sent value is always overwritten, so it cannot be forged. The
--    service role (auth.uid() is null: the app's submit-flight route) keeps
--    the value the server wrote, except that a cleared submitted_at still
--    clears it.
--    The name sorts before `guard_*`, and Postgres fires same-event triggers
--    in name order, so the guard below sees the final value.
--
-- 3. `game_players_set_approved_by` owns `approved_by_user_id` the same way
--    (the approver is the signed-in caller, not what the client sends), and
--    `guard_game_players_insert` refuses a row a signed-in non-admin inserts
--    already approved.
--
-- 4. `guard_game_players_self_update`, rebuilt from 0168 (the latest
--    create-or-replace; 0159 and 0147 are older). A signed-in non-admin may
--    not move a row to another game or another player, and every lookup
--    reads the game the row is in (old.game_id). Own-row branch: clause (f) below. Other-row branch:
--      - `submitted_by_user_id` joins the peer allowlist. The server sets it in
--        the same patch as `submitted_at` when a flightmate delivers.
--      - a true peer (not admin, not the game's creator — both return
--        earlier) may not approve a card they delivered themselves. The owner
--        decided this 2026-09-27: someone else in the flight, or the
--        organiser, approves it. The rule reads the END state, so approving
--        first and delivering after is refused too, as is another peer
--        writing the deliverer in as approver.
--      - no signed-in player (a peer, or the card's owner — new own-row
--        clause (f)) may leave an approval standing on an undelivered card:
--        approve it open, or un-deliver it while approved. The service role
--        skips the guard, so otherwise the app route could complete such a
--        card with the deliverer as approver.
--    Every other line is 0168's, except that its lookups read old.game_id.
--    The function comment is refreshed to match.
--
-- Order against prod: migration FIRST, then merge/deploy. The code on main
-- never writes the column, and the trigger fills it on its own, so the
-- migration is safe before the deploy. The new code against a database
-- without the column fails instead: every delivery would answer db.

alter table public.game_players
  add column submitted_by_user_id uuid references public.users(id);

comment on column public.game_players.submitted_by_user_id is
  'Who marked the card delivered (#2200). Set by trigger game_players_set_submitted_by; null for rows delivered before 0191 and whenever submitted_at is null.';

create index if not exists game_players_submitted_by_user_id_idx
  on public.game_players (submitted_by_user_id);

create or replace function public.game_players_set_submitted_by()
  returns trigger
  language plpgsql
  set search_path to ''
as $$
  declare
    v_uid uuid := auth.uid();
  begin
    if new.submitted_at is null then
      new.submitted_by_user_id := null;
      return new;
    end if;

    -- Service role: keep what the server wrote.
    if v_uid is null then
      return new;
    end if;

    if tg_op = 'INSERT' then
      new.submitted_by_user_id := v_uid;
    elsif old.submitted_at is null then
      new.submitted_by_user_id := v_uid;
    else
      new.submitted_by_user_id := old.submitted_by_user_id;
    end if;
    return new;
  end;
$$;

create trigger game_players_set_submitted_by
  before insert or update on public.game_players
  for each row execute function public.game_players_set_submitted_by();

-- A row written before 0191 may carry an approver without an approval. The
-- trigger below would clear it on the owner's next own-row write, which the
-- guard then reads as the owner touching their own approval. Clear those
-- first; there is nothing approved on them to lose.
update public.game_players
   set approved_by_user_id = null
 where approved_at is null
   and approved_by_user_id is not null;

-- Who approved, owned the same way as who delivered: a signed-in caller who
-- approves is recorded as the approver whatever the client sends, the value
-- stays when the approval does not move, and it clears with the approval.
-- The service role keeps what the server wrote.
create or replace function public.game_players_set_approved_by()
  returns trigger
  language plpgsql
  set search_path to ''
as $$
  declare
    v_uid uuid := auth.uid();
  begin
    if new.approved_at is null then
      new.approved_by_user_id := null;
      return new;
    end if;

    -- Service role: keep what the server wrote.
    if v_uid is null then
      return new;
    end if;

    if tg_op = 'INSERT' then
      new.approved_by_user_id := v_uid;
    elsif old.approved_at is null then
      new.approved_by_user_id := v_uid;
    else
      new.approved_by_user_id := old.approved_by_user_id;
    end if;
    return new;
  end;
$$;

create trigger game_players_set_approved_by
  before insert or update on public.game_players
  for each row execute function public.game_players_set_approved_by();

-- A row a signed-in non-admin inserts never arrives approved. Every insert
-- path that adds a player (the organiser's «add player», sign-up, the
-- waiting room) writes a fresh row; cup and league rows come from the service
-- role, which passes. The approval rules hold for inserts as well as updates.
create or replace function public.guard_game_players_insert()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
as $$
  begin
    if auth.uid() is null or public.is_admin() then
      return new;
    end if;

    if new.approved_at is not null or new.approved_by_user_id is not null then
      raise exception
        'A player cannot insert an approved scorecard (game_players.approved_at/approved_by_user_id)'
        using errcode = 'insufficient_privilege';  -- SQLSTATE 42501
    end if;

    return new;
  end;
$$;

create trigger guard_game_players_insert
  before insert on public.game_players
  for each row execute function public.guard_game_players_insert();

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
    -- Service role (admin client: startGame, signup, flight-join) has no JWT
    -- sub → auth.uid() is NULL: pass through. Admin (is_admin) has full
    -- access per RLS: pass through. Both escapes first.
    if v_uid is null or public.is_admin() then
      return new;
    end if;

    -- #2200: a row never moves to another game or to another player for a
    -- signed-in non-admin, and every lookup below reads the game the row is
    -- IN (old.game_id). Flows that put a row under another player (sign-up,
    -- the guest claim, the cup swap) run as the service role or delete and
    -- insert; none rewrites user_id through a signed-in client.
    if new.game_id is distinct from old.game_id then
      raise exception
        'A player cannot move a game_players row to another game (game_players.game_id)'
        using errcode = 'insufficient_privilege';  -- SQLSTATE 42501
    end if;
    if new.user_id is distinct from old.user_id then
      raise exception
        'A player cannot move a game_players row to another player (game_players.user_id)'
        using errcode = 'insufficient_privilege';  -- SQLSTATE 42501
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
          from public.games g where g.id = old.game_id;

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
          from public.games g where g.id = old.game_id;

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
         where g.id = old.game_id;

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

      -- (f) #2200: never an approval standing on an undelivered card, own row
      -- included. Un-delivering your own approved card would leave it approved
      -- but open, and a service-role delivery (the app route, the team
      -- cascade) would then complete it with the deliverer as approver.
      -- Reopening clears both columns (0159), which still passes.
      if new.approved_at is not null
         and new.submitted_at is null
         and (new.submitted_at is distinct from old.submitted_at
              or new.approved_at is distinct from old.approved_at
              or new.approved_by_user_id is distinct from old.approved_by_user_id) then
        raise exception
          'A player cannot leave an approval on a scorecard that is not delivered (game_players.approved_at)'
          using errcode = 'insufficient_privilege';  -- SQLSTATE 42501
      end if;
    else
      -- ── ANOTHER player's row ─────────────────────────────────────────────
      -- Admin already passed above. The game CREATOR keeps full roster access
      -- (mirrors the "game_players creator update" policy).
      select (g.created_by = v_uid) into v_is_creator
        from public.games g where g.id = old.game_id;
      if coalesce(v_is_creator, false) then
        return new;
      end if;

      -- A true peer may change ONLY the approval and delivery columns (#704,
      -- #2200). Allowlist via jsonb diff so future columns are protected by
      -- default. `submitted_by_user_id` is set by game_players_set_submitted_by
      -- whatever the client sends.
      if (to_jsonb(new) - 'approved_at' - 'approved_by_user_id'
                        - 'rejection_reason' - 'submitted_at'
                        - 'submitted_by_user_id')
         is distinct from
         (to_jsonb(old) - 'approved_at' - 'approved_by_user_id'
                        - 'rejection_reason' - 'submitted_at'
                        - 'submitted_by_user_id') then
        raise exception
          'A peer may only change approval columns (approved_at, approved_by_user_id, rejection_reason, submitted_at, submitted_by_user_id) on another player''s row'
          using errcode = 'insufficient_privilege';  -- SQLSTATE 42501
      end if;

      -- #2200: a true peer never leaves an approval standing on an undelivered
      -- card. The service role skips this guard, so without this a peer could
      -- approve a flightmate's open card and then have the app route (or the
      -- one-ball team cascade) deliver it, ending up as both deliverer and
      -- approver. Every legitimate approve filters on a delivered card, and
      -- every reopen/reject clears approved_at together with submitted_at.
      if new.approved_at is not null
         and new.submitted_at is null
         and (new.approved_at is distinct from old.approved_at
              or new.approved_by_user_id is distinct from old.approved_by_user_id
              or new.submitted_at is distinct from old.submitted_at) then
        raise exception
          'A player cannot leave an approval on a scorecard that is not delivered (game_players.approved_at)'
          using errcode = 'insufficient_privilege';  -- SQLSTATE 42501
      end if;

      -- #2200 (owner's decision 2026-09-27): the peer who delivered this card
      -- may not also approve it. Someone else in the flight, or the organiser
      -- (returned above), approves it. Clearing an approval stays allowed.
      --
      -- Checked on the END state, whenever an approval or delivery column
      -- moves: approving an undelivered card first and delivering it after
      -- lands in the same place, and so does another peer writing the
      -- deliverer in as approver. Every reopen/reject path clears approved_at
      -- together with submitted_at, so a legitimate re-delivery never meets
      -- an approval still standing.
      if new.approved_at is not null
         and new.submitted_by_user_id is not null
         and (new.approved_at is distinct from old.approved_at
              or new.approved_by_user_id is distinct from old.approved_by_user_id
              or new.submitted_at is distinct from old.submitted_at
              or new.submitted_by_user_id is distinct from old.submitted_by_user_id)
         and (new.submitted_by_user_id = v_uid
              or old.submitted_by_user_id = v_uid
              or new.approved_by_user_id = new.submitted_by_user_id) then
        raise exception
          'A player cannot approve a scorecard they delivered (game_players.submitted_by_user_id)'
          using errcode = 'insufficient_privilege';  -- SQLSTATE 42501
      end if;
    end if;

    return new;
  end;
$$;

comment on function public.guard_game_players_self_update() is
  '#670 + #704 + #802 + #1049 + #1321 + #1362 + #1855 + #2200: blocks a non-admin '
  'player from self-approving, self-(un)withdrawing, editing own '
  'course_handicap post-start, or marking own paid_at (own row), and from '
  'self-regrouping UNLESS they created the game; the creator may CLEAR their '
  'own approval (#1362 reopen) but never set it; restricts a non-admin peer to '
  'ONLY the approval and delivery columns on another player''s row, and never '
  'lets that peer approve a card they delivered (#2200); no signed-in player '
  'leaves an approval on an undelivered card or moves a row to another game '
  'or player (#2200). No-ops for admin, the '
  'game creator (another''s row), and the service role. When changing this '
  'body: copy from the LATEST create-or-replace — find it with grep, not from '
  'a file''s own claim (trap 4, #1855).';
