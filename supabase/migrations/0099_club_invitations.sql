-- 0099_club_invitations.sql
-- #644: Klubb-invitasjon for uregistrerte e-poster.
--
-- I dag krever «Legg til medlem på e-post» (add_club_member_by_email) at personen
-- allerede har en Tørny-konto — ukjent e-post gir 'not_found'. Spill-invitasjoner
-- (public.invitations, 0001) støtter derimot uregistrerte: en varsel-mail går ut,
-- og ved registrering knyttes invitéen til spillet (login/actions.ts verifyCode).
-- Klubb-medlemskap manglet dette. Vi speiler spill-flyten:
--   - club_invitations          : ventende klubb-invitasjon for en e-post uten konto.
--   - add_club_member_by_email() : ukjent e-post → 'invited' (i stedet for 'not_found'),
--                                  med tak-/utløp-respekt og idempotent insert.
--   - accept_club_invitations()  : ved registrering knyttes invitéen til klubben(e)
--                                  (kalles fra verifyCode, etter spill-avstemmingen).
--
-- Additivt: ny tabell + ny RPC + CREATE OR REPLACE av add_club_member_by_email
-- (bevarer ACL fra 0075/0076). Tabellen er trygg å applye før kode-deploy; den
-- nye 'invited'-retur-koden treffer ikke før addMember-actionen er deployet (i dag
-- kaster den bare 'not_found' for ukjente e-poster, som før).

-- ── club_invitations ─────────────────────────────────────────────────────────
-- Speiler public.invitations (0001): email + token + invited_by + expires_at +
-- accepted_at, men scopet til en klubb (group_id) i stedet for et spill (game_id).
create table public.club_invitations (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  email       text not null,
  token       text not null unique,
  invited_by  uuid references public.users(id) on delete set null,
  expires_at  timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at  timestamptz not null default now()
);

-- Én åpen (ikke-akseptert) invitasjon per (klubb, e-post). Akseptert/historiske
-- rader teller ikke, så en person kan inviteres på nytt etter at en gammel
-- invitasjon er konsumert. Speiler partial-unique-mønsteret i game_registration.
create unique index club_invitations_open_group_email_idx
  on public.club_invitations (group_id, lower(email))
  where accepted_at is null;

create index club_invitations_email_idx on public.club_invitations (lower(email));
create index club_invitations_group_idx on public.club_invitations (group_id);

comment on table public.club_invitations is
  'Ventende klubb-invitasjon for en e-post uten Tørny-konto (#644). Speiler '
  'public.invitations (spill); accept_club_invitations() gjør invitéen til medlem '
  'ved registrering. Partial-unique på (group_id, lower(email)) where accepted_at is null.';

alter table public.club_invitations enable row level security;

-- RLS: kun gruppe-admin (eier/admin) ser, oppretter og sletter rader for sin klubb.
-- Ingen annen tilgang — invitéen har ingen konto ennå, så ingen self-select.
create policy "club_invitations admin select"
  on public.club_invitations for select to authenticated
  using (public.is_group_admin(group_id));

create policy "club_invitations admin insert"
  on public.club_invitations for insert to authenticated
  with check (public.is_group_admin(group_id));

create policy "club_invitations admin delete"
  on public.club_invitations for delete to authenticated
  using (public.is_group_admin(group_id));

-- ── CREATE OR REPLACE add_club_member_by_email (+ uregistrert → invitasjon) ────
-- Bygger på 0076-versjonen (tak + utløp). Eneste endring: en ukjent e-post fører
-- ikke lenger til 'not_found' — i stedet opprettes en ventende club_invitation og
-- vi returnerer 'invited'. Taket teller nå AKTIVE medlemmer + ÅPNE invitasjoner,
-- så en klubb ikke kan over-invitere forbi member_cap. Idempotent: finnes en åpen
-- invitasjon for (klubb, e-post) allerede, returneres 'invited' uten ny rad.
-- CREATE OR REPLACE bevarer eksisterende ACL (revoke anon / grant authenticated).
create or replace function public.add_club_member_by_email(p_group_id uuid, p_email text)
  returns text
  language plpgsql security definer set search_path = ''
  as $$
  declare
    v_uid    uuid := auth.uid();
    v_email  text := lower(trim(coalesce(p_email, '')));
    v_target uuid;
    v_member boolean;
    v_cap    int;
    v_valid  timestamptz;
    v_count  int;
    v_open   boolean;
  begin
    if not public.is_group_admin(p_group_id) then
      raise exception 'not_authorized';
    end if;
    if length(v_email) = 0 then
      raise exception 'email_required';
    end if;
    select member_cap, valid_until into v_cap, v_valid
      from public.groups where id = p_group_id;
    -- Frossen klubb (utløpt avtale) tar ikke imot nye medlemmer/invitasjoner (#50).
    if v_valid is not null and v_valid < now() then
      return 'club_expired';
    end if;
    select id into v_target from public.users where lower(email) = v_email limit 1;

    -- ── Eksisterende Tørny-bruker: legg til som medlem direkte (som før). ──
    if v_target is not null then
      select exists(
        select 1 from public.group_members
        where group_id = p_group_id and user_id = v_target
      ) into v_member;
      if v_member then
        return 'already_member';
      end if;
      -- Medlemstak (#50): null = ubegrenset. Teller aktive medlemmer + åpne
      -- invitasjoner, så summen aldri overstiger taket.
      if v_cap is not null then
        select
          (select count(*) from public.group_members where group_id = p_group_id)
          + (select count(*) from public.club_invitations
               where group_id = p_group_id and accepted_at is null and expires_at > now())
          into v_count;
        if v_count >= v_cap then
          return 'club_full';
        end if;
      end if;
      insert into public.group_members (group_id, user_id, role)
      values (p_group_id, v_target, 'member');
      return 'added';
    end if;

    -- ── Ukjent e-post: opprett en ventende klubb-invitasjon (#644). ──
    -- Allerede en åpen, gyldig invitasjon? Idempotent — ikke lag en ny rad.
    select exists(
      select 1 from public.club_invitations
      where group_id = p_group_id
        and lower(email) = v_email
        and accepted_at is null
        and expires_at > now()
    ) into v_open;
    if v_open then
      return 'invited';
    end if;
    -- Tak: aktive medlemmer + åpne invitasjoner < member_cap.
    if v_cap is not null then
      select
        (select count(*) from public.group_members where group_id = p_group_id)
        + (select count(*) from public.club_invitations
             where group_id = p_group_id and accepted_at is null and expires_at > now())
        into v_count;
      if v_count >= v_cap then
        return 'club_full';
      end if;
    end if;
    -- Rydd evt. utløpt invitasjon for samme (klubb, e-post) så partial-unique-
    -- indeksen ikke kolliderer (gammel åpen-men-utløpt rad teller fortsatt åpen
    -- i indeksen siden accepted_at er null).
    delete from public.club_invitations
      where group_id = p_group_id
        and lower(email) = v_email
        and accepted_at is null
        and expires_at <= now();
    insert into public.club_invitations (group_id, email, token, invited_by)
    values (p_group_id, v_email, gen_random_uuid()::text, v_uid);
    return 'invited';
  end $$;

-- ── RPC: accept_club_invitations (avstemming ved registrering) ─────────────────
-- Kalles fra verifyCode etter spill-invitasjon-avstemmingen. For hver åpen,
-- ikke-utløpt klubb-invitasjon som matcher den innloggede brukerens e-post:
-- gjør dem til medlem (rolle 'member', idempotent) og marker invitasjonen
-- akseptert. Respekterer member_cap/valid_until: en frossen eller full klubb
-- hoppes over og invitasjonen står åpen (kan godtas når avtalen fornyes / det
-- blir plass). security definer fordi vi skriver group_members + club_invitations
-- på tvers med én avstemt e-post-gate (ingen RLS-rolle for invitéen ennå).
create or replace function public.accept_club_invitations() returns int
  language plpgsql security definer set search_path = ''
  as $$
  declare
    v_uid     uuid := auth.uid();
    v_email   text;
    v_inv     record;
    v_cap     int;
    v_valid   timestamptz;
    v_count   int;
    v_joined  int := 0;
  begin
    if v_uid is null then
      raise exception 'not_authenticated';
    end if;
    select lower(email) into v_email from public.users where id = v_uid;
    if v_email is null then
      return 0;
    end if;

    for v_inv in
      select id, group_id
        from public.club_invitations
        where lower(email) = v_email
          and accepted_at is null
          and expires_at > now()
    loop
      select member_cap, valid_until into v_cap, v_valid
        from public.groups where id = v_inv.group_id;

      -- Frossen klubb: hopp over, la invitasjonen stå åpen.
      if v_valid is not null and v_valid < now() then
        continue;
      end if;

      -- Allerede medlem (idempotent / annen vei inn)? Marker akseptert, ingen
      -- ny rad.
      if exists (
        select 1 from public.group_members
        where group_id = v_inv.group_id and user_id = v_uid
      ) then
        update public.club_invitations
          set accepted_at = now() where id = v_inv.id;
        continue;
      end if;

      -- Fullt medlemstak: hopp over, la invitasjonen stå åpen.
      if v_cap is not null then
        select count(*) into v_count
          from public.group_members where group_id = v_inv.group_id;
        if v_count >= v_cap then
          continue;
        end if;
      end if;

      insert into public.group_members (group_id, user_id, role)
      values (v_inv.group_id, v_uid, 'member')
      on conflict (group_id, user_id) do nothing;
      update public.club_invitations
        set accepted_at = now() where id = v_inv.id;
      v_joined := v_joined + 1;
    end loop;

    return v_joined;
  end $$;

-- Lås accept_club_invitations til innloggede (jf. 0077/0084-mønsteret). Supabase
-- grant-er anon via ALTER DEFAULT PRIVILEGES, så revoke fra anon eksplisitt.
revoke all on function public.accept_club_invitations() from public;
revoke execute on function public.accept_club_invitations() from anon;
grant execute on function public.accept_club_invitations() to authenticated;
