-- 0128_signup_source_public_metric.sql
-- #1022 (epic #1021): kilde-attribusjon for den offentlige påmeldingssiden.
--
-- ⚠️ Staging først (0107-mønsteret): påfør torny-staging, verifiser, DERETTER prod.
--
-- To ting:
--   1. `game_players.signup_source` — nullable kanal-attribusjon satt ved
--      selv-påmelding som startet på en offentlig flate: 'public_page'
--      (landingssiden) eller 'poster' (QR-plakaten). NULL = alle andre veier
--      (invitasjon, klubb, venn, admin, wizard). Settes kun ved INSERT i
--      registerForOpenGame; ingen UPDATE-flate eksponeres.
--   2. `admin_key_metrics()` får feltet `public_signups`: antall ikke-trukne
--      påmeldinger med kilde-attribusjon, uansett spillstatus — det måler
--      akkvisisjon (epicens suksessmål), ikke fullføring. Kroppen er
--      0127-versjonen (gjeste-ekskludering beholdt) pluss ett felt.

alter table public.game_players
  add column signup_source text
  check (signup_source in ('public_page', 'poster'));

comment on column public.game_players.signup_source is
  '#1022 (0128): kanal-attribusjon for selv-påmelding via offentlig flate — '
  'public_page (landingssiden) eller poster (QR-plakat). NULL = alle andre veier.';

create or replace function public.admin_key_metrics()
returns jsonb
  language plpgsql security definer stable
  set search_path = ''
  as $$
  declare
    v_result jsonb;
  begin
    if not public.is_admin() then
      raise exception 'not_authorized';
    end if;

    with finished_players as (
      -- Én rad per (spill, spiller): ikke-trukne deltakere i fullførte spill.
      select gp.game_id, gp.user_id
      from public.game_players gp
      join public.games g on g.id = gp.game_id
      where g.status = 'finished'
        and gp.withdrawn_at is null
        and gp.user_id is not null
    ),
    per_user as (
      -- #1009: gjester teller ikke som brukere (plassholder-kontoer), men
      -- fingerprints-CTE-en under bruker finished_players urørt så gjengen
      -- beholder gjesten.
      select fp.user_id, count(distinct fp.game_id) as n
      from finished_players fp
      join public.users u on u.id = fp.user_id
      where not u.is_guest
      group by fp.user_id
    ),
    fingerprints as (
      -- Gjeng-fingerprint: sortert spillersett per fullført spill med ≥2 spillere.
      select array_agg(user_id order by user_id) as fp
      from finished_players
      group by game_id
      having count(*) >= 2
    ),
    per_gjeng as (
      select fp, count(*) as n
      from fingerprints
      group by fp
    ),
    weeks as (
      -- Siste 8 Oslo-uker (mandagsstart), eldste først, inneværende sist.
      select (date_trunc('week', now() at time zone 'Europe/Oslo')::date
              - (i * 7))::date as week_start
      from generate_series(7, 0, -1) as i
    ),
    finished_per_week as (
      select date_trunc('week', g.ended_at at time zone 'Europe/Oslo')::date
               as week_start,
             count(*) as n
      from public.games g
      where g.status = 'finished'
        and g.ended_at is not null
      group by 1
    )
    select jsonb_build_object(
      'users_ge1',   (select count(*) from per_user),
      'users_ge2',   (select count(*) from per_user where n >= 2),
      'gjenger_ge2', (select count(*) from per_gjeng where n >= 2),
      -- #1022 (0128): akkvisisjon via offentlige flater — teller påmeldinger
      -- (ikke fullføringer), derfor ingen finished-join.
      'public_signups', (
        select count(*)
        from public.game_players gp
        where gp.signup_source is not null
          and gp.withdrawn_at is null
      ),
      'weeks', (
        select jsonb_agg(
                 jsonb_build_object(
                   'week_start', to_char(w.week_start, 'YYYY-MM-DD'),
                   'finished',   coalesce(f.n, 0)
                 )
                 order by w.week_start
               )
        from weeks w
        left join finished_per_week f on f.week_start = w.week_start
      )
    ) into v_result;

    return v_result;
  end $$;

comment on function public.admin_key_metrics() is
  '#1010 (0126) + #1009 (0127) + #1022 (0128): read-only Sekretariat-metrics — '
  'users/gjenger with >=2 finished games, 8-week Oslo-truncated trend, and '
  'public_signups (non-withdrawn game_players rows with signup_source set — '
  'acquisition via public page/poster). Guest users (is_guest) excluded from '
  'users_ge1/ge2 but kept in gjeng fingerprints. SECURITY DEFINER with in-body '
  'is_admin() gate; authenticated only.';

-- 0104-herdingen re-anvendt (create or replace beholder ACL-er, men vi er
-- eksplisitte som i 0126/0127):
revoke all on function public.admin_key_metrics() from public;
revoke execute on function public.admin_key_metrics() from anon;
grant execute on function public.admin_key_metrics() to authenticated;
