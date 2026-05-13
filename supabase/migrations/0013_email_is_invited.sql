-- email_is_invited(text) returns true if the email has at least one open
-- (non-accepted, non-expired) row in public.invitations. SECURITY DEFINER
-- so the login server-action can call it without exposing the invitations
-- table to anonymous SELECT (current policy 0002 already allows it, but
-- the RPC narrows the surface).
--
-- Companion to email_is_registered (added in 0009). Together they let the
-- upcoming OTP-code login flow gate signInWithOtp's shouldCreateUser
-- behind email-is-known checks without exposing public.invitations or
-- auth.users directly.
create or replace function public.email_is_invited(check_email text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.invitations
    where lower(email) = lower(check_email)
      and accepted_at is null
      and (expires_at is null or expires_at > now())
  );
$$;

grant execute on function public.email_is_invited(text) to anon, authenticated;
