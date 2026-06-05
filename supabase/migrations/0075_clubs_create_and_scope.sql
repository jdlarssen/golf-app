-- 0075_clubs_create_and_scope.sql
-- #442 (Klubb-skala epic): opprett klubb (eierskap) + klubb-scoped oppdagbarhet.
--
-- Bygger på #49 (0074 groups/group_members). Låser opp det #49 bevisst utsatte:
--   - games.group_id      : et spill kan høre til én klubb (nullable, SET NULL ved sletting).
--   - groups.short_id      : delbar «bli med»-lenke (speiler games.short_id-mønsteret, 0041).
--   - group_join_requests  : be-om-å-bli-med-forespørsler (speiler game_registration_requests, 0042).
--   - create_club()        : SECURITY DEFINER-RPC. Løser owner-bootstrap (#49-flagget) + håndhever
--                            klubb-tak (2 opprettede per bruker) atomisk.
--   - add_club_member_by_email() : eier legger til eksisterende bruker på e-post.
--   - decide_join_request()      : eier godkjenner/avslår forespørsel (insert membership ved godkjenning).
--   - notifications.kind  += 'club_join_request'.
--
-- Additivt: ingen eksisterende kolonne/policy/funksjon endres bortsett fra
-- notifications_kind_check (drop/re-add, mønster 0044/0069). Trygt å applye før
-- kode-deploy (jf. 0071/0074-headeren).

-- ── games.group_id ───────────────────────────────────────────────────────────
-- Et spill hører valgfritt til én klubb. SET NULL: sletter man klubben overlever
-- spillet (mister bare klubb-tilknytningen), samme mønster som groups.created_by.
alter table public.games
  add column group_id uuid references public.groups(id) on delete set null;

create index games_group_id_idx on public.games (group_id) where group_id is not null;

comment on column public.games.group_id is
  'Valgfri klubb-tilknytning (#442). Klubb-medlemmer ser + kan melde seg på spillet '
  'uansett registration_mode (medlemskap ER invitasjonen). NULL = ikke klubb-scopet.';

-- ── groups.short_id (delbar «bli med»-lenke) ─────────────────────────────────
-- Speiler generate_game_short_id() (0041): 8-char base36, kollisjons-retry,
-- UNIQUE-backup ved race. Egen funksjon fordi den sjekker public.groups.
alter table public.groups add column short_id text;

create or replace function public.generate_group_short_id() returns text
language plpgsql as $$
declare
  alphabet text := '0123456789abcdefghijklmnopqrstuvwxyz';
  candidate text;
  attempt int;
  pos int;
begin
  for attempt in 1..20 loop
    candidate := '';
    for pos in 1..8 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * 36)::int, 1);
    end loop;
    -- Sjekk unikhet før retur — UNIQUE-constraint er backup ved race.
    perform 1 from public.groups where short_id = candidate;
    if not found then
      return candidate;
    end if;
  end loop;
  raise exception 'Kunne ikke generere unik short_id etter 20 forsøk';
end $$;

-- Backfill eksisterende grupper (per d.d. kun backfill-gruppa 'Tørny' fra 0074).
update public.groups set short_id = public.generate_group_short_id() where short_id is null;

-- Lås non-null + default + format + unique etter backfill (speiler 0041).
alter table public.groups alter column short_id set not null;
alter table public.groups alter column short_id set default public.generate_group_short_id();
alter table public.groups add constraint groups_short_id_format
  check (short_id ~ '^[0-9a-z]{8}$');
alter table public.groups add constraint groups_short_id_unique unique (short_id);

create index groups_short_id_idx on public.groups (short_id);

-- Generatoren kalles av groups.short_id-default ved klient-insert → authenticated
-- trenger EXECUTE. Lås fra anon/public (ingen grunn til å eksponere generatoren).
revoke all on function public.generate_group_short_id() from public;
revoke execute on function public.generate_group_short_id() from anon;
grant execute on function public.generate_group_short_id() to authenticated;

-- ── group_join_requests (be om å bli med) ────────────────────────────────────
-- Speiler game_registration_requests (0042) uten lag-felter; gjenbruker
-- registration_request_status-enumet (pending/approved/rejected/withdrawn).
create table public.group_join_requests (
  id                 uuid primary key default gen_random_uuid(),
  group_id           uuid not null references public.groups(id) on delete cascade,
  user_id            uuid not null references public.users(id)  on delete cascade,
  status             public.registration_request_status not null default 'pending',
  message            text,
  decided_at         timestamptz,
  decided_by_user_id uuid references public.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  -- Én rad per (gruppe, bruker) på tvers av alle status-verdier (jf. 0042).
  unique (group_id, user_id),
  constraint group_join_message_length check (message is null or length(message) <= 200)
);

create index group_join_requests_group_status_idx
  on public.group_join_requests (group_id, status);
create index group_join_requests_user_idx
  on public.group_join_requests (user_id);

alter table public.group_join_requests enable row level security;

-- SELECT: søker ser egne; gruppe-admin/owner ser alle for klubben.
create policy "group_join_requests view own or admin"
  on public.group_join_requests for select to authenticated
  using (user_id = auth.uid() or public.is_group_admin(group_id));

-- INSERT: en innlogget bruker oppretter egen pending-rad (lenke-flyten).
create policy "group_join_requests self insert pending"
  on public.group_join_requests for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');

-- UPDATE: gruppe-admin/owner avgjør (godkjenn/avslå) — gjøres via RPC under.
create policy "group_join_requests admin update"
  on public.group_join_requests for update to authenticated
  using (public.is_group_admin(group_id))
  with check (public.is_group_admin(group_id));

-- UPDATE: søker kan kun trekke egen pending → withdrawn.
create policy "group_join_requests self withdraw"
  on public.group_join_requests for update to authenticated
  using (user_id = auth.uid() and status = 'pending')
  with check (user_id = auth.uid() and status = 'withdrawn');

comment on table public.group_join_requests is
  'Ventende/avgjorte «be om å bli med»-forespørsler for klubber (#442). '
  'decide_join_request() lager group_members-rad ved godkjenning.';

-- ── RPC: create_club (løser owner-bootstrap + klubb-tak) ──────────────────────
-- Under #49-RLS kan ikke et nytt medlem self-grante 'owner' (is_group_admin er
-- usann ved første rad). create_club kjører security definer (bypasser RLS) og
-- gjør gruppe-insert + owner-membership atomisk. Håndhever klubb-tak = 2 opprettede
-- per bruker (brems mot spøkelse-klubber; heves i #50). short_id fylles av default.
create or replace function public.create_club(p_name text) returns uuid
  language plpgsql security definer set search_path = ''
  as $$
  declare
    v_uid   uuid := auth.uid();
    v_name  text := trim(coalesce(p_name, ''));
    v_count int;
    v_group uuid;
  begin
    if v_uid is null then
      raise exception 'not_authenticated';
    end if;
    if length(v_name) = 0 then
      raise exception 'name_required';
    end if;
    if length(v_name) > 60 then
      raise exception 'name_too_long';
    end if;
    select count(*) into v_count from public.groups where created_by = v_uid;
    if v_count >= 2 then
      raise exception 'club_cap_reached';
    end if;
    insert into public.groups (name, created_by)
    values (v_name, v_uid)
    returning id into v_group;
    insert into public.group_members (group_id, user_id, role)
    values (v_group, v_uid, 'owner');
    return v_group;
  end $$;

-- ── RPC: add_club_member_by_email ────────────────────────────────────────────
-- Eier/admin legger til en eksisterende Tørny-bruker på e-post. Returnerer status
-- i stedet for å kaste på «ikke funnet» (det er en gyldig UX-tilstand, ikke en feil).
create or replace function public.add_club_member_by_email(p_group_id uuid, p_email text)
  returns text
  language plpgsql security definer set search_path = ''
  as $$
  declare
    v_email  text := lower(trim(coalesce(p_email, '')));
    v_target uuid;
    v_member boolean;
  begin
    if not public.is_group_admin(p_group_id) then
      raise exception 'not_authorized';
    end if;
    if length(v_email) = 0 then
      raise exception 'email_required';
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
    insert into public.group_members (group_id, user_id, role)
    values (p_group_id, v_target, 'member');
    return 'added';
  end $$;

-- ── RPC: decide_join_request ─────────────────────────────────────────────────
-- Gruppe-admin/owner godkjenner eller avslår en pending forespørsel. Ved godkjenning
-- opprettes group_members-raden atomisk. security definer fordi vi skriver på tvers
-- av group_join_requests + group_members med én authz-sjekk.
create or replace function public.decide_join_request(p_request_id uuid, p_approve boolean)
  returns text
  language plpgsql security definer set search_path = ''
  as $$
  declare
    v_uid    uuid := auth.uid();
    v_group  uuid;
    v_user   uuid;
    v_status public.registration_request_status;
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

-- Lås alle tre RPCene til innloggede (jf. 0071/0074).
revoke all on function public.create_club(text) from public;
revoke execute on function public.create_club(text) from anon;
grant execute on function public.create_club(text) to authenticated;

revoke all on function public.add_club_member_by_email(uuid, text) from public;
revoke execute on function public.add_club_member_by_email(uuid, text) from anon;
grant execute on function public.add_club_member_by_email(uuid, text) to authenticated;

revoke all on function public.decide_join_request(uuid, boolean) from public;
revoke execute on function public.decide_join_request(uuid, boolean) from anon;
grant execute on function public.decide_join_request(uuid, boolean) to authenticated;

-- ── notifications.kind += club_join_request ──────────────────────────────────
-- Eier varsles når noen ber om å bli med via lenken. Mønster 0044/0069.
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
    -- Ny for #442:
    'club_join_request'         -- «X vil bli med i klubben din»-varsel til eier/admin
  ));
