-- 0198 (#2260): the Kompis catalogue starts with Best ball, Stableford, Wolf
-- and Skins.
--
-- Step 2 of the wizard recommends the first format in the catalogue that fits
-- the player count and lists the next three under it (lib/wizard/
-- formatRecommendation.ts). The owner chose this order for four players.
-- Sekretariatet → Format can only switch visible, primary, cup and active, so
-- the order is set here. sort_order 1–4 sits below every other Kompis row
-- (the lowest in 0081 is 10), and the four become primary, so no other row
-- can land between them.
--
-- Data only: the app works with and without it. Prod gets it after the
-- deploy of the merge commit is READY (post-deploy). getFormatsForIntent is
-- cached under the tag `format-mapping` for 24 hours and a migration does not
-- revalidate it: switch «Primær» off and on again for Skins in Sekretariatet
-- → Format → Kompis afterwards, and load step 2 twice.
--
-- The change bypasses recordFormatMappingChange, so it is not in
-- Sekretariatet's change log; this file and PR are the trace.
--
-- The block checks its own result with getFormatsForIntent's sort and rolls
-- back if the catalogue does not start with the four.

do $$
declare
  n int;
  top4 text[];
begin
  update public.format_intent_mapping m
     set is_primary = true, is_visible = true, sort_order = v.sort_order
    from (values ('best_ball', 1), ('stableford', 2), ('wolf', 3), ('skins', 4))
           as v(slug, sort_order)
   where m.intent = 'kompis' and m.format_slug = v.slug;
  get diagnostics n = row_count;
  if n <> 4 then
    raise exception '#2260: forventet 4 rader, fikk %', n;
  end if;

  -- Same order as getFormatsForIntent: visible + active, is_primary desc,
  -- sort_order, format_slug.
  select array_agg(format_slug order by is_primary desc, sort_order, format_slug)
    into top4
    from (
      select m.format_slug, m.is_primary, m.sort_order
        from public.format_intent_mapping m
        join public.formats f on f.slug = m.format_slug
       where m.intent = 'kompis' and m.is_visible and f.is_active
       order by m.is_primary desc, m.sort_order, m.format_slug
       limit 4
    ) t;
  if top4 is distinct from array['best_ball', 'stableford', 'wolf', 'skins'] then
    raise exception '#2260: Kompis-katalogen starter med %, ikke best_ball, stableford, wolf, skins', top4;
  end if;
end $$;
