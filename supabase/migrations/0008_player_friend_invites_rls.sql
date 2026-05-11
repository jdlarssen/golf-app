-- Allow authenticated users to insert friend-invites (game_id NULL).
-- App-level quota is the primary enforcement; this policy only ensures
-- the row truthfully attributes itself to the inviter and is not
-- game-scoped (game-scoped invites remain admin-only via the existing
-- "invitations admin write" policy).
create policy "invitations player friend-invite insert" on public.invitations
  for insert
  with check (
    invited_by = auth.uid()
    and game_id is null
  );

-- Allow inviter to read their own outgoing friend-invites — needed for
-- the /profile quota state lookup and a potential future "pending
-- invites" listing.
create policy "invitations select own outgoing" on public.invitations
  for select
  using (invited_by = auth.uid() and game_id is null);
