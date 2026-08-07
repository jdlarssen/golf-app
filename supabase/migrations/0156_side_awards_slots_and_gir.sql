-- 0156_side_awards_slots_and_gir.sql
--
-- Cup-sidepoeng utvidet (#1489): flere vinner-plasser per (type, hull) og GIR
-- som ny sidepoeng-type.
--
-- CTP/LD med N vinnere ("per flight") lagres som N rader med slot 1..N — én
-- rad per vinner-plass, slik at vinner-registreringen (winner_user_id per rad)
-- gjenbrukes uendret. Eksisterende rader blir slot 1 via default.
--
-- GIR ("green in regulation" på utvalgte hull) lagres som ÉN rad per hull
-- (slot 1) med maks-per-lag og to teller-kolonner som arrangøren fyller etter
-- runden. Poeng = teller × points (utfoldingen skjer i getCupSnapshot, ikke i
-- DB). Ingen spiller-attribusjon — winner_user_id er alltid NULL for gir.
--
-- NULL vs. 0 i tellerne: NULL = ikke registrert ennå, 0 = eksplisitt
-- registrert null GIR. Begge bidrar 0 poeng; skillet er kun semantisk i
-- admin-panelet.
--
-- RLS uendret fra 0154: SELECT for authenticated, INGEN write-policies — all
-- skriving går via service-role i server-actions gatet av
-- requireAdminOrClubAdminOfCup, så nye kolonner er automatisk dekket mot
-- direkte PostgREST-writes.

alter table public.tournament_side_awards
  add column slot integer not null default 1,
  add column gir_max_per_team integer null,
  add column gir_team1_count integer null,
  add column gir_team2_count integer null;

alter table public.tournament_side_awards
  add constraint tournament_side_awards_slot_check
  check (slot between 1 and 10);

-- Én config-rad per (type, hull) blir én rad PER VINNER-PLASS: unique-nøkkelen
-- fra 0154 utvides med slot.
alter table public.tournament_side_awards
  drop constraint tournament_side_awards_tournament_id_kind_hole_number_key;

alter table public.tournament_side_awards
  add constraint tournament_side_awards_tournament_kind_hole_slot_key
  unique (tournament_id, kind, hole_number, slot);

alter table public.tournament_side_awards
  drop constraint tournament_side_awards_kind_check;

alter table public.tournament_side_awards
  add constraint tournament_side_awards_kind_check
  check (kind in ('ctp', 'ld', 'gir'));

-- Form-håndheving per kind: gir-rader bærer maks + tellere (0..maks), aldri
-- winner_user_id, og alltid slot 1 (én rad per hull — unique over gjør resten).
-- ctp/ld-rader bærer aldri gir-kolonnene.
alter table public.tournament_side_awards
  add constraint tournament_side_awards_gir_shape_check
  check (
    (
      kind = 'gir'
      and slot = 1
      and winner_user_id is null
      and gir_max_per_team is not null
      and gir_max_per_team between 1 and 10
      and (gir_team1_count is null or gir_team1_count between 0 and gir_max_per_team)
      and (gir_team2_count is null or gir_team2_count between 0 and gir_max_per_team)
    )
    or (
      kind in ('ctp', 'ld')
      and gir_max_per_team is null
      and gir_team1_count is null
      and gir_team2_count is null
    )
  );
