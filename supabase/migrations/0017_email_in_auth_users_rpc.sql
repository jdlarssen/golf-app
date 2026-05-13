-- RPC to check whether an email exists in auth.users directly.
-- Closes a gap in the friend-invite flow: email_is_registered (0009) only
-- checks public.users, so anyone who started the legacy magic-link flow but
-- never completed /complete-profile exists only in auth.users and would slip
-- through the existing guard. Checking auth.users as well ensures those
-- partial accounts are blocked too.
--
-- SECURITY DEFINER is required because auth.users is not directly accessible
-- to the caller's role. The function only returns a boolean — it never leaks
-- user IDs or any other column — so it is safe to grant to anon and
-- authenticated. Granting to anon matches the pattern used for
-- email_is_invited (0013), which must also be callable from the unauthenticated
-- login page; friend-invite is authenticated-only but we grant anon for
-- defensive symmetry and to avoid breakage if the call site is ever reached
-- before the auth session is fully propagated.
create or replace function public.email_is_in_auth_users(email_to_check text)
  returns boolean
  language sql
  security definer
  stable
  set search_path = public, auth, pg_catalog
  as $$
    select exists(
      select 1
      from auth.users
      where lower(email) = lower(email_to_check)
    );
  $$;

revoke all on function public.email_is_in_auth_users(text) from public;
grant execute on function public.email_is_in_auth_users(text) to anon, authenticated;
