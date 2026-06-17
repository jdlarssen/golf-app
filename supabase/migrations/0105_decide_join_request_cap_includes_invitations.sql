-- 0105_decide_join_request_cap_includes_invitations.sql
-- #660: decide_join_request ignorerte åpne club_invitations i cap-sjekken.
--
-- Problem:
--   add_club_member_by_email (0099) teller aktive medlemmer + åpne invitasjoner
--   for å håndheve member_cap:
--       count(group_members) + count(club_invitations WHERE accepted_at IS NULL AND expires_at > now())
--   decide_join_request (0076) teller KUN aktive medlemmer:
--       count(group_members)
--   Dette betyr at en klubb med member_cap=10, 9 medlemmer og 1 åpen invitasjon:
--     • «Legg til på e-post» → blokkeres korrekt (9+1=10 ≥ 10)
--     • Godkjenning av join-forespørsel → passerer (9 < 10) → 11 totalt ved
--       accept av den ventende invitasjonen. Tak brutt.
--
-- Fix:
--   CREATE OR REPLACE decide_join_request med identisk signatur, kropp og
--   ACL-oppsett — eneste endring er cap-tellingen som nå speiler
--   add_club_member_by_email: aktive medlemmer + åpne, ikke-utløpte
--   club_invitations. Eksisterende ACL (revoke anon / grant authenticated)
--   fra 0076 bevares av CREATE OR REPLACE-semantikken.
--
-- Ingen andre endringer. Trigger, RLS-policyer, andre funksjoner: urørt.
-- Trygt å applisere uavhengig av kode-deploy (kun server-side RPC-endring).

create or replace function public.decide_join_request(p_request_id uuid, p_approve boolean)
  returns text
  language plpgsql security definer set search_path = ''
  as $$
  declare
    v_uid    uuid := auth.uid();
    v_group  uuid;
    v_user   uuid;
    v_status public.registration_request_status;
    v_cap    int;
    v_valid  timestamptz;
    v_count  int;
  begin
    select group_id, user_id, status
      into v_group, v_user, v_status
      from public.group_join_requests
      where id = p_request_id;
    if v_group is null then
      raise exception 'request_not_found';
    end if;
    if not public.is_group_admin(v_group) then
      raise exception 'not_authorized';
    end if;
    if v_status <> 'pending' then
      raise exception 'already_decided';
    end if;
    if p_approve then
      select member_cap, valid_until into v_cap, v_valid
        from public.groups where id = v_group;
      -- Frossen klubb / utløpt avtale (#50): blokkér godkjenning.
      if v_valid is not null and v_valid < now() then
        return 'club_expired';
      end if;
      -- #660: tell aktive medlemmer + åpne, ikke-utløpte invitasjoner —
      -- speilet etter add_club_member_by_email (0099) for konsistens.
      -- Uten dette kan klubben overstige member_cap via join-forespørsels-
      -- stien mens en åpen invitasjon teller på e-post-stien.
      if v_cap is not null then
        select
          (select count(*) from public.group_members where group_id = v_group)
          + (select count(*) from public.club_invitations
               where group_id = v_group
                 and accepted_at is null
                 and expires_at > now())
          into v_count;
        if v_count >= v_cap then
          return 'club_full';
        end if;
      end if;
      insert into public.group_members (group_id, user_id, role)
      values (v_group, v_user, 'member')
      on conflict (group_id, user_id) do nothing;
      update public.group_join_requests
        set status = 'approved', decided_at = now(), decided_by_user_id = v_uid
        where id = p_request_id;
      return 'approved';
    else
      update public.group_join_requests
        set status = 'rejected', decided_at = now(), decided_by_user_id = v_uid
        where id = p_request_id;
      return 'rejected';
    end if;
  end $$;
