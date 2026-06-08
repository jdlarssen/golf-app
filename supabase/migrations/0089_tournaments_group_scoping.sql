-- 0089_tournaments_group_scoping.sql
-- #524 (#480 Fase 2): klubb-scopet CUP — speiler klubb-liga (0083).
--
-- Additivt: ny nullable group_id på tournaments + RLS-omskriving. NULL =
-- frittstående cup (som i dag); satt = klubb-cup (medlemmer ser, klubb-admin
-- styrer). Mal: leagues group-scoping i 0083.
--
-- BUGFIX som bivirkning: tournaments hadde RLS på med KUN
-- tournaments_select_authenticated (using true) og INGEN write-policy.
-- Cup-handlingene bruker request-scoped (authenticated) klient → enhver insert
-- ble nektet (42501), så cup-oppretting var ødelagt (prod-tabellen er tom).
-- Den nye WRITE-policyen gjenoppretter frittstående cup-oppretting for global
-- admin (group_id null → with check is_admin()).

-- ── tournaments.group_id ─────────────────────────────────────────────────────
-- En cup hører valgfritt til én klubb. SET NULL: sletter man klubben overlever
-- cupen (mister bare klubb-tilknytningen), samme mønster som games.group_id (0075)
-- og leagues.group_id (0083).
alter table public.tournaments
  add column group_id uuid references public.groups(id) on delete set null;

create index tournaments_group_id_idx on public.tournaments (group_id) where group_id is not null;

comment on column public.tournaments.group_id is
  'Valgfri klubb-tilknytning (#524, #480 F2). NULL = frittstående cup (venner). '
  'Satt = klubb-cup: medlemmer ser den, klubb-admin styrer den.';

-- ── SELECT: scoped ───────────────────────────────────────────────────────────
-- Frittstående synlig for alle innloggede (som i dag); klubb-scopet kun
-- medlemmer + global admin. (Offentlig /cup/[id] gates i app-laget i tillegg,
-- siden getCupSnapshot bruker admin-client som omgår RLS.)
drop policy "tournaments_select_authenticated" on public.tournaments;
create policy "tournaments select scoped" on public.tournaments for select to authenticated
  using (group_id is null or public.is_admin() or public.is_group_member(group_id));

-- ── WRITE: admin eller klubb-admin ───────────────────────────────────────────
-- Ny policy (ingen fantes → fikser også den latente write-buggen). Frittstående
-- (group_id null) forblir global-admin-only; klubb-cup: global admin ELLER
-- klubb-admin av cupens klubb. (for all dekker også SELECT, men OR-es permissivt
-- med "tournaments select scoped" — samme ufarlige overlapp som leagues i 0083.)
create policy "tournaments admin or club-admin write" on public.tournaments for all to authenticated
  using (public.is_admin() or (group_id is not null and public.is_group_admin(group_id)))
  with check (public.is_admin() or (group_id is not null and public.is_group_admin(group_id)));
