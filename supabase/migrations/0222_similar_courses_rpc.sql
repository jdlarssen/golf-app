-- 0222_similar_courses_rpc.sql
-- #2485: «Finnes banen alt?» mens du skriver navnet på en ny bane.
--
-- **Problemet.** `createCourse` sjekker ikke om banen finnes. Skriver du navnet litt
-- annerledes enn det som står i biblioteket («byneset gk» mot «Byneset Golfklubb»),
-- finner du ikke banen i veiviseren og lager en til. Slug-triggeren (0129) gir den nye
-- en adresse med «-2», og rundene og statistikken deles i to.
--
-- **Regelen bor her, ett sted.** `course_match_key` er nøkkelen to navn sammenlignes på:
-- `slugify_course_name` (0129, samme æøå-regel som adressene) uten ordene som skiller
-- skrivemåter av samme klubb («golfklubb», «golfbane», «golfpark», «golf», «gk»).
-- Appen har ingen TS-kopi av regelen; den sender bare teksten du har skrevet (felle 4).
--
-- **Treff.** Søkets nøkkel står inne i banens nøkkel («byneset-n» i «byneset-north»),
-- eller banens nøkkel står som hele ord inne i søkets («byneset» i
-- «byneset-og-country-club»). Hele ord i den retningen, så «Bynesett» ikke treffer
-- «Byneset». En nøkkel under tre tegn treffer bare samme nøkkel, så «Os GK» finner
-- «Os Golfklubb» uten at «os» treffer alt med «os» i. Opptil fem baner: samme nøkkel
-- først, så nøkler som starter med søket, så flest runder, så navn.
--
-- ⚠️ **Hvorfor SECURITY DEFINER.** Banene, hullene og tee-ene er lesbare for alle alt
-- (0002). Det eneste funksjonen legger til, er ett tall per bane: hvor mange runder
-- (aktive og ferdige) som er spilt der. `games` er ikke lesbar for alle (0092), så tallet
-- kan ikke telles med brukerens egen klient. Ingen `games`-rad, ingen spiller og ingen
-- dato forlater funksjonen. authenticated-only (anon revoked).
--
-- Kjørerekkefølge: staging først, prod kun etter eier-ja (#1074). Koden kaller RPC-en,
-- så prod må ha den før koden deployes. Fram til da gir søket en feil, og panelet blir
-- borte (best-effort, skjemaet virker som før).

create or replace function public.course_match_key(input text)
  returns text
  language sql
  immutable
  set search_path = ''
  as $$
    select trim(both '-' from
      regexp_replace(
        regexp_replace(
          '-' || public.slugify_course_name(input) || '-',
          '-(golfklubb|golfbane|golfpark|golf|gk)(?=-)', '-', 'g'),
        '-+', '-', 'g'));
  $$;

comment on function public.course_match_key(text) is
  '#2485 (0222): nøkkelen to banenavn sammenlignes på i similar_courses. '
  'slugify_course_name (0129) uten ordene golfklubb, golfbane, golfpark, golf og gk.';

create or replace function public.similar_courses(p_query text)
  returns table (
    id uuid,
    name text,
    slug text,
    hole_count int,
    par int,
    tee_count int,
    round_count int
  )
  language sql
  security definer
  stable
  set search_path = ''  -- hardened: every reference below is schema-qualified
  as $$
    with q as (
      select public.course_match_key(left(coalesce(p_query, ''), 80)) as key
    ),
    matches as (
      select c.id, c.name, c.slug, public.course_match_key(c.name) as key
        from public.courses c
    )
    select
      m.id,
      m.name,
      m.slug,
      (select count(*)::int from public.course_holes h where h.course_id = m.id),
      (select coalesce(sum(h.par_mens), 0)::int from public.course_holes h where h.course_id = m.id),
      (select count(*)::int from public.tee_boxes t
        where t.course_id = m.id and t.archived_at is null),
      (select count(*)::int from public.games g
        where g.course_id = m.id and g.status in ('active', 'finished')) as round_count
    from matches m
    cross join q
    where m.key <> ''
      and (
        m.key = q.key
        or (
          length(q.key) >= 3
          and (
            position(q.key in m.key) > 0
            or position('-' || m.key || '-' in '-' || q.key || '-') > 0
          )
        )
      )
    -- Samme nøkkel først, så nøkler som starter med søket, så flest runder, så navn.
    -- Uten den første regelen kunne «Byneset Golfklubb» falle ut bak fem «Byneset …».
    order by m.key = q.key desc, starts_with(m.key, q.key) desc, round_count desc, m.name
    limit 5;
  $$;

comment on function public.similar_courses(text) is
  '#2485 (0222): SECURITY DEFINER. Opptil fem baner som ligner navnet du skriver på en ny '
  'bane, med antall hull, par (herrer), aktive tee-er og antall aktive og ferdige runder. '
  'Sammenligner på course_match_key. Bare tellingen av runder krever definer-rettigheter; '
  'ingen games-rad forlater funksjonen. authenticated-only (anon revoked).';

revoke all on function public.course_match_key(text) from public;
revoke execute on function public.course_match_key(text) from anon;
grant execute on function public.course_match_key(text) to authenticated;

revoke all on function public.similar_courses(text) from public;
revoke execute on function public.similar_courses(text) from anon;
grant execute on function public.similar_courses(text) to authenticated;
