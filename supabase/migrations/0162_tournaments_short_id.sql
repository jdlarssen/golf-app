-- 0162_tournaments_short_id.sql
-- Delbar påmeldingslenke for cup (issue #1490): tournaments.short_id.
--
-- Eksakt mirror av short_id-mønsteret fra 0041 (games): 8 tegn base36
-- lowercase, plpgsql-generator med kollisjons-retry, nullable→backfill→
-- not null + default + CHECK + UNIQUE + index.

-- Generator-funksjon med kollisjons-retry. UNIQUE-constraint nedenfor fanger
-- race conditions ved parallelle inserts.
create or replace function public.generate_tournament_short_id() returns text
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
    -- Sjekk unikhet før retur — UNIQUE-constraint er backup ved race.
    perform 1 from public.tournaments where short_id = candidate;
    if not found then
      return candidate;
    end if;
  end loop;
  raise exception 'Kunne ikke generere unik short_id etter 20 forsøk';
end $$;

-- Legg til kolonnen nullable først så vi kan backfille eksisterende rader.
alter table public.tournaments add column short_id text;

-- Backfill eksisterende cuper med generert short_id.
update public.tournaments set short_id = public.generate_tournament_short_id() where short_id is null;

-- Lås non-null + default + unique etter backfill.
alter table public.tournaments alter column short_id set not null;
alter table public.tournaments alter column short_id set default public.generate_tournament_short_id();
alter table public.tournaments add constraint tournaments_short_id_format
  check (short_id ~ '^[0-9a-z]{8}$');
alter table public.tournaments add constraint tournaments_short_id_unique unique (short_id);

create index tournaments_short_id_idx on public.tournaments(short_id);

comment on column public.tournaments.short_id is
  '8-char base36 ID for public påmeldings-lenke (/cup/bli-med/[shortId]). Stabilt gjennom cupens levetid.';
