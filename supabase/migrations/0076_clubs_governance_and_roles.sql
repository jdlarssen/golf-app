-- 0076_clubs_governance_and_roles.sql
-- #50 (Klubb-skala epic): klubb-eierskap, delegering & tilgangsstyring.
--
-- Bygger på #49 (0074 groups/group_members) + #442 (0075 klubb-RPCer/discovery).
-- Leverer:
--   - groups.member_cap     : maks antall medlemmer per avtale (null = ubegrenset).
--   - groups.valid_until    : avtalens slutt (null = uendelig). Utløpt ⟺ valid_until < now().
--   - DROP create_club()    : #442 self-serve var en gating-hull (grant til authenticated → en vanlig
--                             bruker kunne kalle RPC-en direkte og omgå UI-gaten). Erstattes av admin_create_club.
--   - admin_create_club()   : is_admin oppretter klubb + overfører til navngitt eier (eneeier).
--   - set_club_member_role(): eier/is_admin endrer medlems-rolle; sist-eier-guard.
--   - add_club_member_by_email() / decide_join_request() : håndhever medlemstak + utløp (CREATE OR REPLACE).
--   - notifications.kind   += 'club_role_changed'.
--
-- Deploy-vindu: #442-koden er live på prod og /klubber/ny kaller create_club. createClub-actionen mapper
-- ukjente RPC-feil til en vennlig «Noe gikk galt»-redirect (ikke 500) → å droppe create_club degraderer
-- grasiøst i vinduet mellom apply (nå) og #50-deploy, og aligner med gating-intensjonen (vanlige brukere skal
-- ikke opprette klubb). Resten er additivt / kompatibelt (de nye cap/utløp-retur-kodene kan ikke fyres på
-- dagens data: eneste klubb har member_cap=null + valid_until=null).

-- ── groups: avtale-rammer ────────────────────────────────────────────────────
alter table public.groups add column member_cap int;
alter table public.groups add column valid_until timestamptz;

alter table public.groups add constraint groups_member_cap_positive
  check (member_cap is null or member_cap >= 1);

comment on column public.groups.member_cap is
  'Maks antall medlemmer per avtale (#50). null = ubegrenset. Håndheves i add_club_member_by_email + '
  'decide_join_request; eksisterende medlemmer grandfathered hvis taket senkes.';
comment on column public.groups.valid_until is
  'Avtalens slutt (#50). null = uendelig. Utløpt ⟺ valid_until < now() (derivert, ingen cron): da fryses '
  'klubben — skjult fra discovery, ingen nye medlemmer/spill, men pågående spill fullføres og data bevares.';

-- ── DROP create_club (#442 self-serve, gating-hull) ──────────────────────────
-- Erstattes av admin_create_club. Dropp lukker bypass-hullet fullstendig (funksjonen finnes ikke lenger).
drop function if exists public.create_club(text);

-- ── RPC: admin_create_club (opprett + overfør til eneeier) ───────────────────
-- Kun is_admin. Oppretter klubben og gjør den navngitte e-post-eieren til ENEEIER (admin blir ikke medlem).
-- Avtale-rammer (member_cap + valid_until) settes ved opprettelse. Atomisk (én transaksjon).
create or replace function public.admin_create_club(
  p_name        text,
  p_owner_email text,
  p_member_cap  int,
  p_valid_until timestamptz
) returns uuid
  language plpgsql security definer set search_path = ''
  as $$
  declare
    v_name  text := trim(coalesce(p_name, ''));
    v_email text := lower(trim(coalesce(p_owner_email, '')));
    v_owner uuid;
    v_group uuid;
  begin
    if not public.is_admin() then
      raise exception 'not_authorized';
    end if;
    if length(v_name) = 0 then
      raise exception 'name_required';
    end if;
    if length(v_name) > 60 then
      raise exception 'name_too_long';
    end if;
    if length(v_email) = 0 then
      raise exception 'owner_email_required';
    end if;
    if p_member_cap is not null and p_member_cap < 1 then
      raise exception 'member_cap_invalid';
    end if;
    select id into v_owner from public.users where lower(email) = v_email limit 1;
    if v_owner is null then
      raise exception 'owner_not_found';
    end if;
    insert into public.groups (name, created_by, member_cap, valid_until)
    values (v_name, auth.uid(), p_member_cap, p_valid_until)
    returning id into v_group;
    insert into public.group_members (group_id, user_id, role)
    values (v_group, v_owner, 'owner');
    return v_group;
  end $$;

-- ── RPC: set_club_member_role (rolle-delegering) ─────────────────────────────
-- Caller må være gruppas EIER (owner) eller global is_admin (jf. eier-valg «bare eier» + admin-overstyring).
-- Sist-eier-guard: kan ikke degradere siste owner (speiler #442 fjern/forlat). Target må være medlem.
create or replace function public.set_club_member_role(
  p_group_id uuid,
  p_user_id  uuid,
  p_role     public.group_role
) returns text
  language plpgsql security definer set search_path = ''
  as $$
  declare
    v_uid         uuid := auth.uid();
    v_caller_role public.group_role;
    v_target_role public.group_role;
    v_owner_count int;
  begin
    if v_uid is null then
      raise exception 'not_authenticated';
    end if;
    select role into v_caller_role
      from public.group_members
      where group_id = p_group_id and user_id = v_uid;
    -- Bare eier (eller global admin) kan endre roller.
    if not (v_caller_role = 'owner' or public.is_admin()) then
      raise exception 'not_authorized';
    end if;
    select role into v_target_role
      from public.group_members
      where group_id = p_group_id and user_id = p_user_id;
    if v_target_role is null then
      raise exception 'not_member';
    end if;
    -- Sist-eier-guard: en klubb må alltid ha ≥1 owner.
    if v_target_role = 'owner' and p_role <> 'owner' then
      select count(*) into v_owner_count
        from public.group_members
        where group_id = p_group_id and role = 'owner';
      if v_owner_count <= 1 then
        raise exception 'last_owner';
      end if;
    end if;
    update public.group_members
      set role = p_role
      where group_id = p_group_id and user_id = p_user_id;
    return p_role::text;
  end $$;

-- ── CREATE OR REPLACE add_club_member_by_email (+ medlemstak + utløp) ─────────
-- CREATE OR REPLACE bevarer eksisterende ACL (revoke anon / grant authenticated fra 0075).
create or replace function public.add_club_member_by_email(p_group_id uuid, p_email text)
  returns text
  language plpgsql security definer set search_path = ''
  as $$
  declare
    v_email  text := lower(trim(coalesce(p_email, '')));
    v_target uuid;
    v_member boolean;
    v_cap    int;
    v_valid  timestamptz;
    v_count  int;
  begin
    if not public.is_group_admin(p_group_id) then
      raise exception 'not_authorized';
    end if;
    if length(v_email) = 0 then
      raise exception 'email_required';
    end if;
    select member_cap, valid_until into v_cap, v_valid
      from public.groups where id = p_group_id;
    -- Frossen klubb (utløpt avtale) tar ikke imot nye medlemmer (#50).
    if v_valid is not null and v_valid < now() then
      return 'club_expired';
    end if;
    select id into v_target from public.users where lower(email) = v_email limit 1;
    if v_target is null then
      return 'not_found';
    end if;
    select exists(
      select 1 from public.group_members
      where group_id = p_group_id and user_id = v_target
    ) into v_member;
    if v_member then
      return 'already_member';
    end if;
    -- Medlemstak (#50): null = ubegrenset.
    if v_cap is not null then
      select count(*) into v_count from public.group_members where group_id = p_group_id;
      if v_count >= v_cap then
        return 'club_full';
      end if;
    end if;
    insert into public.group_members (group_id, user_id, role)
    values (p_group_id, v_target, 'member');
    return 'added';
  end $$;

-- ── CREATE OR REPLACE decide_join_request (+ medlemstak + utløp på approve) ───
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
      -- Frossen klubb / fullt medlemstak (#50): blokkér godkjenning, la forespørselen forbli pending.
      if v_valid is not null and v_valid < now() then
        return 'club_expired';
      end if;
      if v_cap is not null then
        select count(*) into v_count from public.group_members where group_id = v_group;
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

-- ── Lås de nye RPCene til innloggede (jf. 0071/0074/0075) ─────────────────────
revoke all on function public.admin_create_club(text, text, int, timestamptz) from public;
revoke execute on function public.admin_create_club(text, text, int, timestamptz) from anon;
grant execute on function public.admin_create_club(text, text, int, timestamptz) to authenticated;

revoke all on function public.set_club_member_role(uuid, uuid, public.group_role) from public;
revoke execute on function public.set_club_member_role(uuid, uuid, public.group_role) from anon;
grant execute on function public.set_club_member_role(uuid, uuid, public.group_role) to authenticated;

-- ── notifications.kind += club_role_changed ──────────────────────────────────
-- Den berørte varsles når rollen deres endres. Mønster 0044/0069/0075.
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in (
    'invite',
    'peer_approval_request',
    'scorecard_submitted',
    'scorecard_approved',
    'game_finished',
    'product_update',
    'team_invite',
    'registration_request',
    'registration_approved',
    'registration_rejected',
    'team_member_withdrew',
    'deliver_reminder',
    'cup_finished',
    'club_join_request',
    -- Ny for #50:
    'club_role_changed'         -- «Du er nå admin/eier i klubben»-varsel til berørt medlem
  ));
