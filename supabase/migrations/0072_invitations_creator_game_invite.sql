-- 0072_invitations_creator_game_invite.sql
-- #429 (#22 Fase 3): let a game creator email-invite brand-new people to their
-- OWN game.
--
-- Until now game-scoped invitations (invitations.game_id IS NOT NULL) were
-- admin-only: 0002 "invitations admin write" (FOR ALL, is_admin()) plus
-- 0008 "invitations player friend-invite insert" which only permits NON-game
-- invites (with check game_id IS NULL). So inviteEmailToGame's invitations
-- insert (game_id = gameId) is blocked for a non-admin creator, and the same
-- creator can't SELECT their game-scoped invites (idempotency check + pending
-- list read empty).
--
-- These three PERMISSIVE policies OR with the existing admin/friend policies,
-- so admin and friend-invite flows are untouched. Additive + permissive →
-- safe to apply before the code deploys.
--
-- Ownership anchor: the invite must truthfully attribute itself to the creator
-- (invited_by = auth.uid()), be game-scoped (game_id IS NOT NULL), and target a
-- game the caller created (games.created_by = auth.uid() subquery — same shape
-- as 0071's game_players → games anchor).

create policy "invitations creator game-invite insert"
  on public.invitations for insert
  to authenticated
  with check (
    invited_by = auth.uid()
    and game_id is not null
    and exists (
      select 1 from public.games g
      where g.id = invitations.game_id
        and g.created_by = auth.uid()
    )
  );

create policy "invitations creator game-invite select"
  on public.invitations for select
  to authenticated
  using (
    invited_by = auth.uid()
    and game_id is not null
    and exists (
      select 1 from public.games g
      where g.id = invitations.game_id
        and g.created_by = auth.uid()
    )
  );

create policy "invitations creator game-invite delete"
  on public.invitations for delete
  to authenticated
  using (
    invited_by = auth.uid()
    and game_id is not null
    and exists (
      select 1 from public.games g
      where g.id = invitations.game_id
        and g.created_by = auth.uid()
    )
  );
