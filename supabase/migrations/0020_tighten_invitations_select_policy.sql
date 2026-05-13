-- Tighten the broad "invitations select by token" policy (0002_rls_policies.sql).
--
-- Original policy: FOR SELECT USING (true) — any authenticated user could read
-- any invitation row. The comment said "token is the secret; we filter by it in
-- queries", but with OTP-code login (v0.4.0+) the token-URL flow no longer
-- exists. This was a defence-in-depth gap.
--
-- After this migration, authenticated users can SELECT only invitation rows
-- where they are the invitee (matched by email) OR the inviter. The two
-- existing narrower policies from later migrations already cover the inviter
-- arm (0008: "invitations select own outgoing"), so the DROP here is safe once
-- we add the invitee-arm policy below.
--
-- Call sites that relied on USING (true):
--   • app/profile/export/route.ts — GDPR data export, queries .eq('email', userEmail)
--     → now covered by the new "invitations select own incoming" policy.
--   • All /admin/* paths use getServerClient() but are gated by is_admin(), so
--     they fall through to the existing "invitations admin write" (FOR ALL) policy.
--   • lib/invitations/quota.ts + app/invite/actions.ts query .eq('invited_by', uid)
--     → already covered by "invitations select own outgoing" (0008).

drop policy if exists "invitations select by token" on public.invitations;

-- A user may read invitation rows addressed to their own email. This covers
-- the GDPR export endpoint (profile/export/route.ts) which fetches rows by
-- email to include them in the user's data package.
create policy "invitations select own incoming" on public.invitations
  for select
  using (lower(email) = lower(auth.jwt() ->> 'email'));
