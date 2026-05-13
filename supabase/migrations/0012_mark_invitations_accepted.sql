-- Allow an authenticated user to mark THEIR OWN pending invitation rows
-- as accepted. Matched by lowercase email equality between the invitation
-- row and the JWT's email claim. The WITH CHECK ensures the only mutation
-- allowed by this policy is setting `accepted_at` to a non-null timestamp;
-- everything else (email, token, game_id, invited_by, expires_at,
-- created_at) must remain identical to the existing row.
--
-- Admin writes are already covered by the broader "invitations admin write"
-- policy from 0002_rls_policies.sql; this policy is additive and only
-- relaxes the narrow case the auth callback needs.

create policy "invitations self mark accepted" on public.invitations
  for update
  using (
    lower(email) = lower(auth.jwt() ->> 'email')
    and accepted_at is null
  )
  with check (
    lower(email) = lower(auth.jwt() ->> 'email')
    and accepted_at is not null
  );
