-- 0016_harden_pending_users_trigger.sql
-- Defensiv guard mot NULL email i handle_new_auth_user().
-- Frem til nå bruker Tørny bare e-post-OTP, så email er alltid satt.
-- Dersom vi senere legger til Sign in with Apple eller Google kan
-- auth.users.email være NULL (f.eks. Apple Private Relay uten deling).
-- Uten denne guarden ville triggeren krasje og blokkere brukeropprettelse.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is not null then
    insert into public.users (id, email, hcp_index)
    values (new.id, new.email, 54.0)
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;
