-- 0129: Stable, Norwegian-friendly slugs on courses for the public course
-- pages (#1023, epic #1021 «Vindu ut»).
--
-- The slug is FROZEN at creation: renaming a course never changes its slug,
-- so public URLs stay stable without redirect machinery. A deliberate slug
-- change later is a manual SQL edit + redirect in next.config.ts.
--
-- The BEFORE INSERT trigger is the single home for the rule — it covers the
-- admin UI, the user create flow (0070), the create_course_with_layout RPC
-- (0113) and any future NGF import without touching each path.

-- Norwegian-friendly slugify: æ→ae, ø→oe, å→aa, common diacritics folded,
-- everything else non-alphanumeric collapsed to single hyphens.
create or replace function public.slugify_course_name(input text)
returns text
language sql
immutable
as $$
  select trim(both '-' from
    regexp_replace(
      translate(
        replace(replace(replace(lower(coalesce(input, '')), 'æ', 'ae'), 'ø', 'oe'), 'å', 'aa'),
        'äöüéèêëáàâíìîïóòôúùûýñç',
        'aoueeeeaaaiiiiooouuuync'),
      '[^a-z0-9]+', '-', 'g'));
$$;

alter table public.courses add column slug text;

-- Backfill existing rows with deterministic collision suffixes (-2, -3, …)
-- ordered by creation time, so the oldest course keeps the bare slug.
with ranked as (
  select
    id,
    public.slugify_course_name(name) as base,
    row_number() over (
      partition by public.slugify_course_name(name)
      order by created_at, id
    ) as rn
  from public.courses
)
update public.courses c
set slug = case when r.rn = 1 then r.base else r.base || '-' || r.rn end
from ranked r
where r.id = c.id;

alter table public.courses alter column slug set not null;
-- The '' default (always overwritten by the trigger) keeps `slug` OPTIONAL in
-- generated Insert types, so existing course-creation code keeps compiling.
alter table public.courses alter column slug set default '';
alter table public.courses add constraint courses_slug_unique unique (slug);

create or replace function public.set_course_slug()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  base text;
  candidate text;
  n int := 1;
begin
  -- An explicitly supplied slug wins (future imports may pass one).
  if new.slug is not null and new.slug <> '' then
    return new;
  end if;
  base := public.slugify_course_name(new.name);
  if base = '' then
    base := 'bane';
  end if;
  candidate := base;
  while exists (select 1 from public.courses where slug = candidate) loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  new.slug := candidate;
  return new;
end;
$$;

create trigger courses_set_slug
  before insert on public.courses
  for each row
  execute function public.set_course_slug();
