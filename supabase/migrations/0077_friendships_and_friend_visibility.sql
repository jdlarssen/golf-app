-- 0077_friendships_and_friend_visibility.sql
-- #369 (Klubb-skala epic) + #408: venner (flat, gjensidig relasjon) + åpen-for-venner.
--
-- En venneliste er IKKE en klubb (#442): ingen eier, ingen admin, ingen identitet —
-- bare en symmetrisk bruker↔bruker-relasjon som gjør invitering/finning lettere.
--   - friendships              : gjensidig relasjon (pending → accepted), mutasjoner via secdef-RPC.
--   - users.friend_code         : delbar «legg til meg»-lenke (speiler groups.short_id, 0075).
--   - games.let_friends_skip_gate : på manual_approval slipper venner forbi godkjennings-gaten.
--   - send_friend_request / *_by_email / respond / remove / connect_via_friend_code : secdef-RPCer.
--   - notifications.kind  += 'friend_request', 'friend_accepted'.
--
-- Additivt: ingen eksisterende kolonne/policy/funksjon endres bortsett fra
-- notifications_kind_check (drop/re-add, mønster 0044/0075/0076). Trygt å applye før
-- kode-deploy (jf. 0075-headeren).

-- ── users.friend_code (delbar «legg til meg»-lenke) ──────────────────────────
-- Speiler generate_group_short_id() (0075): 8-char base36, kollisjons-retry,
-- UNIQUE-backup ved race. Egen funksjon fordi den sjekker public.users.
alter table public.users add column friend_code text;

create or replace function public.generate_friend_code() returns text
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
    perform 1 from public.users where friend_code = candidate;
    if not found then
      return candidate;
    end if;
  end loop;
  raise exception 'Kunne ikke generere unik friend_code etter 20 forsøk';
end $$;

-- Backfill eksisterende brukere, deretter lås non-null + default + format + unique.
update public.users set friend_code = public.generate_friend_code() where friend_code is null;

alter table public.users alter column friend_code set not null;
alter table public.users alter column friend_code set default public.generate_friend_code();
alter table public.users add constraint users_friend_code_format
  check (friend_code ~ '^[0-9a-z]{8}$');
alter table public.users add constraint users_friend_code_unique unique (friend_code);
create index users_friend_code_idx on public.users (friend_code);

comment on column public.users.friend_code is
  'Delbar «legg til meg»-kode (#369). /venner/legg-til/[friend_code] kobler den som '
  'åpner lenken som venn (gjensidig samtykke: deling + åpning).';

-- friend_code-default kalles ved bruker-insert (handle_new_user-trigger, definer).
revoke all on function public.generate_friend_code() from public;
revoke execute on function public.generate_friend_code() from anon;
grant execute on function public.generate_friend_code() to authenticated;

-- ── games.let_friends_skip_gate ──────────────────────────────────────────────
alter table public.games
  add column let_friends_skip_gate boolean not null default false;

comment on column public.games.let_friends_skip_gate is
  'Når true på et manual_approval-spill: venner av oppretteren slipper forbi '
  'godkjennings-gaten og melder seg på direkte (#369). Ignoreres for andre modi.';

-- ── friendships (flat, gjensidig relasjon) ───────────────────────────────────
-- Rettede rader (requester → addressee). «Venner» = accepted-rad uansett retning.
-- pending = utestående forespørsel. Avslag = rad slettes (kan be på nytt senere).
create table public.friendships (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references public.users(id) on delete cascade,
  addressee_id  uuid not null references public.users(id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  unique (requester_id, addressee_id),
  constraint friendships_not_self check (requester_id <> addressee_id)
);

create index friendships_addressee_status_idx on public.friendships (addressee_id, status);
create index friendships_requester_status_idx on public.friendships (requester_id, status);

alter table public.friendships enable row level security;

-- SELECT: du ser kun rader du er part i. Ingen INSERT/UPDATE/DELETE-policy —
-- alle mutasjoner går via security definer-RPCene under (speil klubb-governance).
create policy "friendships view own"
  on public.friendships for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

comment on table public.friendships is
  'Flat, gjensidig venne-relasjon (#369). status: pending (forespørsel) / accepted '
  '(venner). Avslag sletter raden. Mutasjoner kun via secdef-RPC.';

-- ── RPC: send_friend_request ─────────────────────────────────────────────────
-- Sender forespørsel til en kjent bruker-id. Omvendt pending → aksepteres direkte
-- (de ba allerede deg). Returnerer status-streng (UX-tilstander, ikke feil).
create or replace function public.send_friend_request(p_addressee uuid) returns text
  language plpgsql security definer set search_path = ''
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

-- ── RPC: send_friend_request_by_email ────────────────────────────────────────
-- Slår opp bruker på e-post (definer → forbi users-RLS). Ukjent → 'not_found' så
-- UI kan tilby å invitere på samme e-post. Returnerer jsonb {status, target_id}
-- (target_id trengs i server-action-en for best-effort varsel).
create or replace function public.send_friend_request_by_email(p_email text) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
  declare
    v_uid    uuid := auth.uid();
    v_email  text := lower(trim(coalesce(p_email, '')));
    v_target uuid;
    v_status text;
  begin
    if v_uid is null then raise exception 'not_authenticated'; end if;
    if length(v_email) = 0 then raise exception 'email_required'; end if;
    select id into v_target from public.users where lower(email) = v_email limit 1;
    if v_target is null then
      return jsonb_build_object('status', 'not_found', 'target_id', null);
    end if;
    v_status := public.send_friend_request(v_target);
    return jsonb_build_object('status', v_status, 'target_id', v_target);
  end $$;

-- ── RPC: respond_friend_request ──────────────────────────────────────────────
-- Mottakeren (addressee) godtar eller avslår en pending forespørsel.
-- Godta → accepted; avslå → raden slettes.
create or replace function public.respond_friend_request(p_request_id uuid, p_accept boolean) returns text
  language plpgsql security definer set search_path = ''
  as $$
  declare
    v_uid       uuid := auth.uid();
    v_addressee uuid;
    v_status    text;
  begin
    if v_uid is null then raise exception 'not_authenticated'; end if;
    select addressee_id, status into v_addressee, v_status
      from public.friendships where id = p_request_id;
    if v_addressee is null then return 'not_found'; end if;
    if v_addressee <> v_uid then raise exception 'not_authorized'; end if;
    if v_status <> 'pending' then return 'already_decided'; end if;
    if p_accept then
      update public.friendships set status = 'accepted', responded_at = now()
        where id = p_request_id;
      return 'accepted';
    else
      delete from public.friendships where id = p_request_id;
      return 'declined';
    end if;
  end $$;

-- ── RPC: remove_friend ───────────────────────────────────────────────────────
-- Fjerner en venn ELLER trekker tilbake en utgående/innkommende forespørsel:
-- sletter pending/accepted i begge retninger mellom auth.uid() og p_other.
create or replace function public.remove_friend(p_other uuid) returns text
  language plpgsql security definer set search_path = ''
  as $$
  declare
    v_uid uuid := auth.uid();
    v_n   int;
  begin
    if v_uid is null then raise exception 'not_authenticated'; end if;
    delete from public.friendships
      where status in ('pending', 'accepted')
        and ((requester_id = v_uid and addressee_id = p_other)
          or (requester_id = p_other and addressee_id = v_uid));
    get diagnostics v_n = row_count;
    if v_n = 0 then return 'not_found'; end if;
    return 'removed';
  end $$;

-- ── RPC: connect_via_friend_code ─────────────────────────────────────────────
-- Den som åpner en delt «legg til meg»-lenke kobles direkte som venn (eieren
-- inviterte ved å dele, åpneren aksepterte ved å åpne). Idempotent. Eier blir
-- requester (de delte først). Returnerer jsonb {owner_id, status}.
create or replace function public.connect_via_friend_code(p_code text) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
  declare
    v_uid   uuid := auth.uid();
    v_code  text := lower(trim(coalesce(p_code, '')));
    v_owner uuid;
  begin
    if v_uid is null then raise exception 'not_authenticated'; end if;
    select id into v_owner from public.users where friend_code = v_code limit 1;
    if v_owner is null then raise exception 'code_not_found'; end if;
    if v_owner = v_uid then
      return jsonb_build_object('owner_id', v_owner, 'status', 'self');
    end if;
    if exists (
      select 1 from public.friendships
      where status = 'accepted'
        and ((requester_id = v_uid and addressee_id = v_owner)
          or (requester_id = v_owner and addressee_id = v_uid))
    ) then
      return jsonb_build_object('owner_id', v_owner, 'status', 'already_friends');
    end if;
    -- Rydd evt. pending i begge retninger, sett accepted (eier = requester).
    delete from public.friendships
      where status = 'pending'
        and ((requester_id = v_uid and addressee_id = v_owner)
          or (requester_id = v_owner and addressee_id = v_uid));
    insert into public.friendships (requester_id, addressee_id, status, responded_at)
    values (v_owner, v_uid, 'accepted', now())
    on conflict (requester_id, addressee_id) do update
      set status = 'accepted', responded_at = now();
    return jsonb_build_object('owner_id', v_owner, 'status', 'connected');
  end $$;

-- Lås alle RPCene til innloggede (jf. 0075/0076).
revoke all on function public.send_friend_request(uuid) from public;
revoke execute on function public.send_friend_request(uuid) from anon;
grant execute on function public.send_friend_request(uuid) to authenticated;

revoke all on function public.send_friend_request_by_email(text) from public;
revoke execute on function public.send_friend_request_by_email(text) from anon;
grant execute on function public.send_friend_request_by_email(text) to authenticated;

revoke all on function public.respond_friend_request(uuid, boolean) from public;
revoke execute on function public.respond_friend_request(uuid, boolean) from anon;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;

revoke all on function public.remove_friend(uuid) from public;
revoke execute on function public.remove_friend(uuid) from anon;
grant execute on function public.remove_friend(uuid) to authenticated;

revoke all on function public.connect_via_friend_code(text) from public;
revoke execute on function public.connect_via_friend_code(text) from anon;
grant execute on function public.connect_via_friend_code(text) to authenticated;

-- ── notifications.kind += friend_request, friend_accepted ────────────────────
-- friend_request → mottaker av forespørsel. friend_accepted → avsender når godtatt.
-- Begge deeplinker til /profile/venner. Mønster 0044/0075/0076.
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
    'club_role_changed',
    -- Nye for #369:
    'friend_request',           -- «X vil bli venn med deg»-varsel til mottaker
    'friend_accepted'           -- «X godtok venneforespørselen din»-varsel til avsender
  ));
