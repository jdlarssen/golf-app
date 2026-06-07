-- 0087_league_format_modes.sql
-- #452 Fase 4: åpne liga-formatet for stableford-modi.
--
-- Til og med Fase 3 var `leagues.format` de facto låst til 'stroke' (slagspill) i
-- app-laget, men kolonnen hadde ingen CHECK. Fase 4 introduserer to nye liga-
-- formater — standard og modifisert stableford (begge solo, individuell order-of-
-- merit) — og sesong-tabellen aggregerer da rå stableford-poeng (høyest best) i
-- stedet for mot-par (lavest best). Vi låser kolonnen til de tre støttede verdiene
-- så en manipulert insert ikke kan smugle et uimplementert format inn (app-laget
-- ville da score flighten feil eller falle tilbake til slagspill).
--
-- Additivt + trygt å applye før kode-deploy: default 'stroke' passerer constrainten,
-- og det finnes ingen rader med andre verdier (tabellen er tom per d.d.). Ingen
-- eksisterende policy/kolonne endres.

alter table public.leagues
  add constraint leagues_format_check
  check (format in ('stroke', 'stableford', 'modified_stableford'));

comment on column public.leagues.format is
  'Liga-globalt spillformat. ''stroke'' = slagspill (mot-par, lavest best); '
  '''stableford'' / ''modified_stableford'' = poeng-basert (høyest best). '
  'Sesong-tabellen aggregerer den native per-runde-verdien retnings-bevisst.';
