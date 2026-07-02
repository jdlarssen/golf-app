-- 0126_admin_key_metrics.sql
-- #1010 (epic #1006): «Nøkkeltall» — read-only metrics-RPC for Sekretariatet.
--
-- ⚠️ Staging først (0107-mønsteret): påfør torny-staging, verifiser tallene mot
--    manuell SQL + hostile probe med spiller-JWT, DERETTER prod.
--
-- Én SECURITY DEFINER-RPC som regner epicens suksessmål fra eksisterende data
-- (ingen ny tracking, ingen nye skriveveier):
--
--   { "users_ge1":   antall brukere med ≥1 fullført spill,
--     "users_ge2":   antall brukere med ≥2 fullførte spill,
--     "gjenger_ge2": antall gjenger med ≥2 fullførte spill,
--     "weeks":       [{ "week_start": "YYYY-MM-DD", "finished": n } × 8] }
--
-- Definisjoner (kontrakt-beslutning på issue #1010):
--   • Deltakelse = rad i game_players på et spill med status='finished', der
--     withdrawn_at is null (trukne spillere fullførte ikke runden).
--   • «Gjeng» = eksakt spillersett: fingerprint er den sorterte listen av
--     ikke-trukne user_id-er per fullført spill med ≥2 slike spillere; en
--     gjeng har spilt n runder når n spill deler fingerprint. Kjent
--     begrensning: én ny/manglende spiller gir et nytt fingerprint — valgt
--     fordi eksakt-sett er deterministisk og forklarbart («enkleste ærlige
--     variant», jf. issue). Ingen konfigurerbarhet.
--   • Trend = fullførte spill per Oslo-uke (mandagsstart) siste 8 uker
--     inkludert inneværende, null-fylt. Ukegrensene trunkeres i Europe/Oslo
--     («AT TIME ZONE» på ended_at) så DST håndteres av Postgres — ended_at er
--     ferdig-tidspunktet, ikke created_at. Trenden teller alle fullførte
--     spill uansett spillerantall (også solo).
--
-- Gate: is_admin() i funksjonskroppen (issue-krav «håndhevet i RLS — ikke bare
-- UI»). 0076-malen (admin_create_club) + 0104-herdingen: SECURITY DEFINER,
-- set search_path = '', revoke fra PUBLIC/anon, grant kun til authenticated.

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
      select user_id, count(distinct game_id) as n
      from finished_players
      group by user_id
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
  '#1010 (0126): read-only Sekretariat-metrics — users/gjenger with >=2 finished '
  'games + 8-week Oslo-truncated trend. Gjeng = exact sorted set of non-withdrawn '
  'user_ids per finished game with >=2 players (known limit: one new player => new '
  'fingerprint). SECURITY DEFINER with in-body is_admin() gate; authenticated only.';

revoke all on function public.admin_key_metrics() from public;
revoke execute on function public.admin_key_metrics() from anon;
grant execute on function public.admin_key_metrics() to authenticated;
