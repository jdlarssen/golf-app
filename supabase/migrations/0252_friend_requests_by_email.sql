-- 0252_friend_requests_by_email.sql
-- Friend requests by e-mail, and who counts as a friend when a roster is filled.
--
-- The rules (owner decision, audit 2026-11-20):
--   1. «Legg til venn med e-post» answers the same for every address. The
--      server does the lookup with the service role and never hands the result
--      to the caller: `friend_request_by_email` is not callable through a user
--      session, and the old `send_friend_request_by_email` is gone.
--   2. A request sent by e-mail (`friendships.by_email`) is read by the person
--      who received it. The sender reads it once it is accepted. A request
--      sent to a person the sender picked from a list is read by both, as
--      before.
--   3. Only an accepted friendship makes two people invite-eligible
--      (`is_invite_eligible`). The TypeScript mirror is
--      `lib/games/inviteEligibility.ts` (`getFriendIds`); the two change
--      together (lib/friends/inviteEligibilityRule.test.ts).
--   4. `email_is_registered` and `email_is_in_auth_users` are server helpers:
--      the service role calls them, a user session does not.
--
-- Order: apply this first, then deploy the code. The code before this change
-- calls `send_friend_request_by_email` and the two helpers through a user
-- session; between the two steps «Legg til venn med e-post» answers with the
-- general error, and nothing is written.

-- ── 1. friendships.by_email ─────────────────────────────────────────────────
alter table public.friendships
  add column by_email boolean not null default false;

comment on column public.friendships.by_email is
  'The request was sent to an e-mail address. The sender reads the row once it is accepted (0252).';

drop policy if exists "friendships view own" on public.friendships;
create policy "friendships view own" on public.friendships
  for select to authenticated
  using (
    addressee_id = (select auth.uid())
    or (
      requester_id = (select auth.uid())
      and (status = 'accepted' or not by_email)
    )
  );

-- ── 2. The lookup: service role only ────────────────────────────────────────
drop function if exists public.send_friend_request_by_email(text);

create function public.friend_request_by_email(p_requester uuid, p_email text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
  declare
    v_email  text := lower(trim(coalesce(p_email, '')));
    v_target uuid;
  begin
    if p_requester is null then raise exception 'requester_required'; end if;
    if length(v_email) = 0 then raise exception 'email_required'; end if;

    select id into v_target
      from public.users
     where lower(email) = v_email
       and deleted_at is null
     limit 1;
    if v_target is null then
      return jsonb_build_object('outcome', 'unknown', 'target_id', null);
    end if;
    if v_target = p_requester then
      return jsonb_build_object('outcome', 'self', 'target_id', v_target);
    end if;

    if exists (
      select 1 from public.friendships
       where status = 'accepted'
         and ((requester_id = p_requester and addressee_id = v_target)
           or (requester_id = v_target and addressee_id = p_requester))
    ) then
      return jsonb_build_object('outcome', 'already_friends', 'target_id', v_target);
    end if;

    -- The other person already asked: this is the answer.
    update public.friendships
       set status = 'accepted', responded_at = now()
     where requester_id = v_target and addressee_id = p_requester and status = 'pending';
    if found then
      return jsonb_build_object('outcome', 'accepted', 'target_id', v_target);
    end if;

    insert into public.friendships (requester_id, addressee_id, status, by_email)
    values (p_requester, v_target, 'pending', true)
    on conflict (requester_id, addressee_id) do nothing;
    if found then
      return jsonb_build_object('outcome', 'requested', 'target_id', v_target);
    end if;
    return jsonb_build_object('outcome', 'already_pending', 'target_id', v_target);
  end $$;

revoke all on function public.friend_request_by_email(uuid, text) from public, anon, authenticated;
grant execute on function public.friend_request_by_email(uuid, text) to service_role;

-- ── 3. The id-based request and the withdrawal follow rule 2 ────────────────
-- A request to a person picked from a list is read by both. If an e-mail
-- request to the same person is already waiting, it becomes such a request.
create or replace function public.send_friend_request(p_addressee uuid)
  returns text
  language plpgsql
  security definer
  set search_path = ''
as $$
  declare
    v_uid uuid := auth.uid();
  begin
    if v_uid is null then raise exception 'not_authenticated'; end if;
    if p_addressee is null then raise exception 'addressee_required'; end if;
    if p_addressee = v_uid then return 'self'; end if;
    if not exists (select 1 from public.users where id = p_addressee) then
      return 'not_found';
    end if;
    if exists (
      select 1 from public.friendships
      where status = 'accepted'
        and ((requester_id = v_uid and addressee_id = p_addressee)
          or (requester_id = p_addressee and addressee_id = v_uid))
    ) then
      return 'already_friends';
    end if;
    -- Omvendt pending finnes → aksepter den i stedet for å lage en ny rad.
    if exists (
      select 1 from public.friendships
      where requester_id = p_addressee and addressee_id = v_uid and status = 'pending'
    ) then
      update public.friendships set status = 'accepted', responded_at = now()
        where requester_id = p_addressee and addressee_id = v_uid and status = 'pending';
      return 'accepted';
    end if;
    update public.friendships set by_email = false
      where requester_id = v_uid and addressee_id = p_addressee
        and status = 'pending' and by_email;
    if found then
      return 'requested';
    end if;
    if exists (
      select 1 from public.friendships
      where requester_id = v_uid and addressee_id = p_addressee and status = 'pending'
    ) then
      return 'already_pending';
    end if;
    insert into public.friendships (requester_id, addressee_id, status)
    values (v_uid, p_addressee, 'pending');
    return 'requested';
  end $$;

-- The sender withdraws the requests the sender reads.
create or replace function public.remove_friend(p_other uuid)
  returns text
  language plpgsql
  security definer
  set search_path = ''
as $$
  declare
    v_uid uuid := auth.uid();
    v_n   int;
  begin
    if v_uid is null then raise exception 'not_authenticated'; end if;
    delete from public.friendships
      where status in ('pending', 'accepted')
        and (
          (requester_id = v_uid and addressee_id = p_other
            and (status = 'accepted' or not by_email))
          or (requester_id = p_other and addressee_id = v_uid)
        );
    get diagnostics v_n = row_count;
    if v_n = 0 then return 'not_found'; end if;
    return 'removed';
  end $$;

-- ── 4. Invite eligibility: accepted friendships only ────────────────────────
create or replace function public.is_invite_eligible(p_creator uuid, p_recipient uuid, p_group_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
    select
      exists (
        select 1 from public.friendships f
        where f.status = 'accepted'
          and ((f.requester_id = p_creator and f.addressee_id = p_recipient)
            or (f.addressee_id = p_creator and f.requester_id = p_recipient))
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
  $$;

-- ── 5. The two address helpers: service role only ───────────────────────────
revoke execute on function public.email_is_registered(text) from public, anon, authenticated;
revoke execute on function public.email_is_in_auth_users(text) from public, anon, authenticated;
