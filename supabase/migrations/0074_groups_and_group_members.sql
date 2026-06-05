-- 0074_groups_and_group_members.sql
-- #49 (Klubb-skala epic, sak 1 av 4): grunnmur for multi-tenancy.
--
-- Legger to nye tabeller (groups + group_members) som lar flere uavhengige
-- golfklubber/kompisgjenger eksistere side om side. Saken er bevisst usynlig:
-- ingen UI, ingen group_id på games/courses, ingen omskriving av eksisterende
-- RLS. Å knytte spill/baner til grupper er #50; venner/åpen-påmelding er #369;
-- Klubbhuset-nav er #392.
--
-- Additivt + permissivt + ingen kode leser tabellene ennå → trygt å applye før
-- kode-deploy (samme resonnement som 0071-headeren).
--
-- Eierens valg (kontrakt #49): (a) mange-til-mange medlemskap — en person kan
-- være med i flere grupper; (b) bare fundamentet nå.

-- ── enum: gruppe-rolle ───────────────────────────────────────────────────────
-- role-kolonnen tas allerede nå fordi #50 «admin per gruppe» trenger den. #49
-- bruker den kun til å markere startgruppens skaper som 'owner' i backfill.
create type public.group_role as enum ('owner', 'admin', 'member');

-- ── tabeller ─────────────────────────────────────────────────────────────────
create table public.groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  -- jf. 0070: created_by → SET NULL slik at sletting av en bruker ikke river gruppa.
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id  uuid not null references public.groups(id) on delete cascade,
  user_id   uuid not null references public.users(id)  on delete cascade,
  role      public.group_role not null default 'member',
  joined_at timestamptz not null default now(),
  -- samlet PK ⇒ ingen dublett-medlemskap, men ingen unik på user_id alene
  -- ⇒ samme person kan stå i flere grupper (mange-til-mange).
  primary key (group_id, user_id)
);

-- «hvilke grupper er jeg med i?»-oppslag (gruppe-velger i #392). PK indekserer
-- group_id først, så et eget user_id-indeks trengs for det motsatte oppslaget.
create index group_members_user_id_idx on public.group_members (user_id);

-- ── SECURITY DEFINER-helpere ─────────────────────────────────────────────────
-- En SELECT-policy på group_members som spør group_members ville trigget
-- Postgres' RLS-rekursjonsvern (samme felle som 0003 løste for game_players).
-- security definer bypasser RLS og bryter rekursjonen. Stil speiler 0071.
create or replace function public.is_group_member(p_group_id uuid) returns boolean
  language sql security definer stable set search_path = ''
  as $$
    select exists(
      select 1 from public.group_members
      where group_id = p_group_id and user_id = auth.uid()
    );
  $$;

create or replace function public.is_group_admin(p_group_id uuid) returns boolean
  language sql security definer stable set search_path = ''
  as $$
    select exists(
      select 1 from public.group_members
      where group_id = p_group_id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
    );
  $$;

-- Supabase gir default EXECUTE til anon + authenticated på nye public-funksjoner.
-- Lås til innloggede brukere (jf. 0071) så anon ikke kan probe medlemskap via
-- det auto-eksponerte /rest/v1/rpc-endepunktet.
revoke all on function public.is_group_member(uuid) from public;
revoke execute on function public.is_group_member(uuid) from anon;
grant execute on function public.is_group_member(uuid) to authenticated;

revoke all on function public.is_group_admin(uuid) from public;
revoke execute on function public.is_group_admin(uuid) from anon;
grant execute on function public.is_group_admin(uuid) to authenticated;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.groups        enable row level security;
alter table public.group_members enable row level security;

-- groups: medlemmer ser sine grupper; global admin ser alt.
create policy "groups select member or admin"
  on public.groups for select to authenticated
  using (public.is_admin() or public.is_group_member(id));

create policy "groups insert admin or self"
  on public.groups for insert to authenticated
  with check (public.is_admin() or created_by = auth.uid());

create policy "groups update group admin"
  on public.groups for update to authenticated
  using (public.is_admin() or public.is_group_admin(id))
  with check (public.is_admin() or public.is_group_admin(id));

create policy "groups delete group admin"
  on public.groups for delete to authenticated
  using (public.is_admin() or public.is_group_admin(id));

-- group_members: medlemmer ser medmedlemmer; gruppe-admin/owner forvalter
-- medlemskap; et medlem kan alltid melde seg selv ut.
create policy "group_members select member or admin"
  on public.group_members for select to authenticated
  using (public.is_admin() or public.is_group_member(group_id));

create policy "group_members insert group admin"
  on public.group_members for insert to authenticated
  with check (public.is_admin() or public.is_group_admin(group_id));

create policy "group_members update group admin"
  on public.group_members for update to authenticated
  using (public.is_admin() or public.is_group_admin(group_id))
  with check (public.is_admin() or public.is_group_admin(group_id));

create policy "group_members delete admin or self"
  on public.group_members for delete to authenticated
  using (
    public.is_admin()
    or public.is_group_admin(group_id)
    or user_id = auth.uid()
  );

-- ── backfill: meld alle dagens brukere inn i én startgruppe ──────────────────
-- Prod (verifisert ved skriving): 13 brukere, 1 admin (Jørgen) → 1 gruppe,
-- 13 medlemmer, Jørgen som 'owner'. Startgruppens navn ('Tørny') er en default
-- som kan døpes om når #50 gir gruppe-admin et rename-UI. Blokken kjører som
-- migrasjons-rollen og bypasser dermed RLS.
do $$
declare
  v_admin uuid;
  v_group uuid;
begin
  select id into v_admin
  from public.users
  where is_admin
  order by created_at
  limit 1;

  insert into public.groups (name, created_by)
  values ('Tørny', v_admin)
  returning id into v_group;

  insert into public.group_members (group_id, user_id, role)
  select v_group,
         u.id,
         case when u.id = v_admin then 'owner'::public.group_role
              else 'member'::public.group_role end
  from public.users u;
end $$;
