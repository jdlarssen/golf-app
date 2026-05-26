-- 0039_games_self_registration_columns.sql
-- Legg grunnlaget for selv-påmelding (issue #199).
--
-- Tre nye kolonner på games:
--   - registration_mode (enum): hvem slipper inn (invite_only / manual_approval / open)
--   - registration_type (enum): solo / team / både
--   - short_id (8-char base32): public lenke-id for /påmelding/[shortId]
--
-- Defaults bevarer dagens oppførsel: registration_mode='invite_only',
-- registration_type='solo'. Ingen eksisterende spill får endret semantikk.

-- Akse 1: hvem kan melde seg på
create type public.registration_mode as enum ('invite_only', 'manual_approval', 'open');

alter table public.games
  add column registration_mode public.registration_mode not null default 'invite_only';

-- Akse 2: hva man melder på
create type public.registration_type as enum ('solo', 'team', 'both');

alter table public.games
  add column registration_type public.registration_type not null default 'solo';

-- Public short ID for delbar påmeldings-lenke.
-- 8 tegn × 36 alfabet (base36 lowercase) = ~2.8 trillion kombinasjoner.
-- Vi tar inn 0-9 og a-z (ikke base32-Crockford) fordi konsistens med URL-safe
-- lowercase er viktigere enn å unngå letteforvirrende tegn — short_id deles
-- typisk via clipboard/SMS, ikke skrives manuelt.

-- Generator-funksjon med kollisjons-retry. UNIQUE-constraint nedenfor fanger
-- race conditions ved parallelle inserts.
create or replace function public.generate_game_short_id() returns text
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
    perform 1 from public.games where short_id = candidate;
    if not found then
      return candidate;
    end if;
  end loop;
  raise exception 'Kunne ikke generere unik short_id etter 20 forsøk';
end $$;

-- Legg til kolonnen nullable først så vi kan backfille eksisterende rader.
alter table public.games add column short_id text;

-- Backfill eksisterende spill med generert short_id.
update public.games set short_id = public.generate_game_short_id() where short_id is null;

-- Lås non-null + default + unique etter backfill.
alter table public.games alter column short_id set not null;
alter table public.games alter column short_id set default public.generate_game_short_id();
alter table public.games add constraint games_short_id_format
  check (short_id ~ '^[0-9a-z]{8}$');
alter table public.games add constraint games_short_id_unique unique (short_id);

create index games_short_id_idx on public.games(short_id);

comment on column public.games.registration_mode is
  'Hvem som kan melde seg på spillet. invite_only=dagens flyt (admin inviterer); '
  'manual_approval=spillere ber om plass, admin godkjenner; open=fri-slipp via short_id-lenke.';
comment on column public.games.registration_type is
  'Hva man melder på. solo=individuell; team=lag (Scramble/Ryder Cup); both=hybrid.';
comment on column public.games.short_id is
  '8-char base36 ID for public påmeldings-lenke (/påmelding/[shortId]). Stabilt gjennom spillets levetid.';
