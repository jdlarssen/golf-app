-- 0070: Vanlige brukere kan opprette egne baner (#366)
--
-- Åpner bane-opprettelse for ALLE innloggede brukere via en ekte RLS
-- insert-own-policy — ikke service-role-bypass. Tidligere kunne kun admin
-- (via "courses admin write") og en hardkodet trusted-creator-allowlist
-- (#198/#223, via getAdminClient()) skrive. Når CREATE åpnes for alle er en
-- `with check (created_by = auth.uid())`-policy riktigere enn å rute alle
-- writes gjennom service-role.
--
-- SELECT forblir `using(true)` (uendret) — kritisk for scoring: medspillere
-- i et spill på en bruker-opprettet bane må kunne lese banen.
--
-- INGEN UPDATE/DELETE-own-policy: #366 er create-only for vanlige brukere.
-- Edit/delete forblir admin + trusted (uendret, via getAdminClient).

-- 1. INSERT-own policies. Permissive → OR-es med de eksisterende
--    "*_admin write"-policiene, så admin-stien er uberørt.

create policy "courses authenticated insert own"
  on public.courses for insert to authenticated
  with check (created_by = auth.uid());

create policy "holes authenticated insert own"
  on public.course_holes for insert to authenticated
  with check (
    exists (
      select 1 from public.courses c
      where c.id = course_holes.course_id
        and c.created_by = auth.uid()
    )
  );

create policy "tees authenticated insert own"
  on public.tee_boxes for insert to authenticated
  with check (
    exists (
      select 1 from public.courses c
      where c.id = tee_boxes.course_id
        and c.created_by = auth.uid()
    )
  );

-- 2. created_by / updated_by ON DELETE SET NULL.
--    Dagens FK-er er NO ACTION. users_id_fkey (public.users → auth.users) er
--    CASCADE, så `auth.admin.deleteUser()` (konto-sletting) prøver å slette
--    public.users-raden — men courses-FK-ene blokkerer hvis brukeren har
--    opprettet baner. Med delt bibliotek skal banen overleve: created_by/
--    updated_by settes til NULL, banen blir værende for andres spill.

alter table public.courses
  drop constraint courses_created_by_fkey,
  add constraint courses_created_by_fkey
    foreign key (created_by) references public.users(id) on delete set null;

alter table public.courses
  drop constraint courses_updated_by_fkey,
  add constraint courses_updated_by_fkey
    foreign key (updated_by) references public.users(id) on delete set null;
