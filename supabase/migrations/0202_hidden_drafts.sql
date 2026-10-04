-- 0202 — A draft is hidden from its players until it is published (#2445).
--
-- Owner's choice 02.10 («Ja, skjult»): a game with status = 'draft' belongs to
-- its organiser. Only the organiser (games.created_by) and a global admin
-- (users.is_admin) see it, also when other players are on its list. Once the
-- game is published ('scheduled'), the players see it as before.
--
-- Who sees a draft:
--   before: the organiser, global admins AND every player on its list (the
--           game, the whole list and the co-players' profiles); the list also
--           made them co-players of each other (friend suggestions, team
--           candidates, the app's roster picker, invite eligibility).
--   after:  the organiser and global admins. A player on someone else's draft
--           sees nothing of it, and the draft makes nobody a co-player except
--           for its organiser.
--
-- Three objects change, and nothing else:
--   a) "games select if participant or admin": the participant branch requires
--      status <> 'draft'. "games select own created" (created_by = auth.uid())
--      is untouched and stays the organiser's way in.
--   b) is_in_game(uuid): "on the list of a non-draft game". Its only user is
--      "game_players select shared game", so a player no longer sees a draft's
--      list, and "users select own or shared games" (which reads game_players
--      under the caller's RLS) no longer shows the co-players through it. The
--      status check lives here, inside the SECURITY DEFINER function: an
--      inline EXISTS on games in a game_players policy recurses through the
--      games policy above (42P17, see 0160). The organiser sees their own
--      draft's list through "game_players creator select".
--   c) is_invite_eligible(uuid, uuid, uuid): the co-player branch only counts a
--      game that is not a draft, or the creator's own draft. roster_candidates
--      and the guard_game_players_invite_eligibility trigger follow it
--      unchanged.
--
-- create or replace keeps the owner and the grants of both functions; alter
-- policy keeps the policy's name and roles. No data changes, so the choice can
-- be undone without loss (the PR body holds the old bodies).
--
-- The service-client doors players reach without RLS (signup, discovery, the
-- invite card at login, the landing after login, the calendar file, withdraw)
-- check status = 'draft' in the app code, and lib/users/getCoPlayerIds.ts
-- mirrors c). lib/games/status.ts points back here.
--
-- Test: supabase/tests/games_draft_hidden_rls_test.sql and the 13-15 block in
-- supabase/tests/roster_candidates_rpc_test.sql.

-- a) ─────────────────────────────────────────────────────────────────────────
alter policy "games select if participant or admin" on public.games
  using (
    is_admin()
    or (
      games.status <> 'draft'::public.game_status
      and exists (
        select 1 from game_players
         where game_players.game_id = games.id
           and game_players.user_id = (select auth.uid())
      )
    )
  );

comment on policy "games select if participant or admin" on public.games is
  '#2445: a draft is seen only by its organiser (via "games select own created") '
  'and global admins, also when you are on its list. Participants see a game once '
  'it is published. Test: supabase/tests/games_draft_hidden_rls_test.sql.';

-- b) ─────────────────────────────────────────────────────────────────────────
create or replace function public.is_in_game(p_game_id uuid) returns boolean
  language sql security definer stable
  set search_path = public, pg_catalog
  as $$
    select exists(
      select 1
        from public.game_players gp
        join public.games g on g.id = gp.game_id
       where gp.game_id = p_game_id
         and gp.user_id = auth.uid()
         and g.status <> 'draft'
    );
  $$;

comment on function public.is_in_game(uuid) is
  '#2445: true when the caller is on the list of a non-draft game; the '
  'organiser''s own draft is covered by game_players creator select. Used only '
  'by the policy "game_players select shared game". The status check lives here '
  'and not inline in that policy: an EXISTS on games there recurses through the '
  'games select policy (42P17). A draft is seen only by its organiser and global '
  'admins. Test: supabase/tests/games_draft_hidden_rls_test.sql.';

-- c) ─────────────────────────────────────────────────────────────────────────
-- Copied from the live definition (pg_get_functiondef on staging, 03.10); only
-- the co-player branch changes.
create or replace function public.is_invite_eligible(p_creator uuid, p_recipient uuid, p_group_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
    select
      exists (
        select 1 from public.friendships f
        where (f.requester_id = p_creator and f.addressee_id = p_recipient)
           or (f.addressee_id = p_creator and f.requester_id = p_recipient)
      )
      or exists (
        select 1
        from public.game_players me
        join public.game_players them on me.game_id = them.game_id
        join public.games g on g.id = me.game_id
        where me.user_id = p_creator
          and them.user_id = p_recipient
          and (g.status <> 'draft'::public.game_status or g.created_by = p_creator)
      )
      or (
        p_group_id is not null
        and exists (
          select 1 from public.group_members gm
          where gm.group_id = p_group_id
            and gm.user_id = p_recipient
        )
      );
  $function$;

comment on function public.is_invite_eligible(uuid, uuid, uuid) is
  '#921 (0115): SECURITY DEFINER. Mirrors getInviteEligibleIds '
  '(lib/games/inviteEligibility.ts): true if the recipient is a friend '
  '(accepted or pending, both directions), a co-player (shared game) or a club '
  'member (when group_id is set) of the creator. Self/admin are handled by the '
  'guard_game_players_invite_eligibility trigger, not here. authenticated-only '
  '(anon revoked). #2445: a draft makes co-players only for its organiser, '
  'since a draft is seen only by its organiser and global admins; '
  'lib/users/getCoPlayerIds.ts mirrors that rule, change both together. '
  'Test: supabase/tests/games_draft_hidden_rls_test.sql and '
  'supabase/tests/roster_candidates_rpc_test.sql (13-15).';
