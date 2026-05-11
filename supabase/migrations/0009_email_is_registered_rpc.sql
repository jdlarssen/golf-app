-- RPC to check whether an email has a Tørny account, bypassing RLS.
-- Used by the friend-invite flow to block invitations to addresses
-- already on Tørny (which would otherwise receive a confusing
-- "X has invited you" mail and have their user_metadata.inviter_name
-- overwritten by signInWithOtp).
--
-- SECURITY DEFINER lets the function read public.users regardless of
-- the caller's RLS-restricted view. The function only returns a
-- boolean — it never leaks user IDs or any other column — so it is
-- safe to grant to authenticated. We do NOT grant to anon.
create or replace function public.email_is_registered(p_email text)
  returns boolean
  language sql
  security definer
  stable
  set search_path = public, pg_catalog
  as $$
    select exists(select 1 from public.users where email = lower(p_email));
  $$;

revoke all on function public.email_is_registered(text) from public;
grant execute on function public.email_is_registered(text) to authenticated;
