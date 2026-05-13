-- 0014_pending_users.sql
-- Allow public.users rows to exist before the user has logged in and filled
-- in their profile. Auto-create them via trigger on auth.users insert so the
-- admin player picker can include invitees who haven't signed up yet.

-- 1. Relax NOT NULL on name. NULL == "invited but profile not yet filled in".
alter table public.users alter column name drop not null;

-- 2. Add the completion timestamp. NULL == pending registration.
alter table public.users add column profile_completed_at timestamptz;

-- 3. Backfill: every existing row was created via /complete-profile, so
--    treat them all as completed. Use created_at as the timestamp.
update public.users
set profile_completed_at = created_at
where profile_completed_at is null;

-- 4. Backfill placeholder rows for any auth.users without a public row.
--    Picks up the 5 known pending invitees (mia, sivert, martin, philip,
--    kristian) as well as any future stragglers from before this migration.
insert into public.users (id, email, hcp_index)
select au.id, au.email, 54.0
from auth.users au
left join public.users pu on pu.id = au.id
where pu.id is null;

-- 5. Auto-create placeholder rows for future auth.users inserts. Idempotent
--    via on conflict so it doesn't conflict with the existing
--    /complete-profile insert path during this migration window.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, hcp_index)
  values (new.id, new.email, 54.0)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
