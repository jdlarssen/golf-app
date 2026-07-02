-- 0127_users_is_guest.sql
-- #1009 (epic #1006): «Gjestespiller-lite» — skygge-bruker-flagget users.is_guest.
--
-- ⚠️ Staging først (0107-mønsteret): påfør torny-staging, verifiser med
--    hostile-prober (self-flip av is_guest) + metrics-delta-probe, DERETTER prod.
--
-- En gjest er en EKTE bruker-rad (auth.users + public.users) med plassholder-
-- e-post `gjest+<uuid>@guest.tornygolf.no` (subdomene uten MX — kan aldri motta
-- OTP) opprettet av arrangøren via service-role. Flagget styrer tre ting:
--
--   1. Eksklusjon fra klubbstatistikk, nøkkeltall og alle mail-utsendelser
--      (plassholder-adressene ville bouncet). App-laget filtrerer sine queries;
--      admin_key_metrics() får eksklusjonen her (per_user-CTE-en).
--   2. «Gjest»-chip på arrangør-synlige roster-flater (rent visning, app-laget).
--   3. Claim: arrangøren flipper e-posten til gjestens ekte adresse (GoTrue
--      admin + public.users.email); ved gjestens første OTP-innlogging nuller
--      appen is_guest via service-role. En innlogget bruker skal ALDRI kunne
--      flippe flagget selv (verken på eller av) — det ville meldt dem inn/ut av
--      stats- og mail-eksklusjonene — derfor utvides guard_users_self_update-
--      denylisten (0107-arven) her.
--
-- Gjeng-fingerprints i admin_key_metrics beholder gjester med vilje
-- (kontrakt-beslutning 1 på issue #1009): gjengen inkluderer gjesten, og etter
-- claim består samme uuid → kontinuitet i fingerprintet.

alter table public.users
  add column is_guest boolean not null default false;

comment on column public.users.is_guest is
  '#1009 (0127): true = skygge-bruker opprettet av en arrangør (gjestespiller '
  'med plassholder-e-post, ingen innlogging). Ekskluderes fra klubbstats, '
  'nøkkeltall (users_ge1/ge2) og mail-utsendelser; beholdes i gjeng-'
  'fingerprints. Nulles av appen (service-role) ved første innlogging etter '
  'claim. Self-endring blokkeres av guard_users_self_update.';

-- ── Self-update-guard: is_guest inn i denylisten (0107-mønsteret) ─────────────
-- Erstatter funksjonen på plass; triggeren fra 0107 står urørt.

create or replace function public.guard_users_self_update()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
as $$
  declare
    v_uid uuid := auth.uid();
  begin
    -- Service-role / internal writes (no JWT) and global admins may change anything.
    if v_uid is null or public.is_admin() then
      return new;
    end if;

    -- A non-admin editing a users row (their own, per RLS) must never flip is_admin.
    if new.is_admin is distinct from old.is_admin then
      raise exception
        'is_admin can only be changed by an administrator (public.users.is_admin)'
        using errcode = 'insufficient_privilege';
    end if;

    -- #1009: is_guest gates stats/mail exclusions and the claim flow — only the
    -- service-role app paths (guest creation, first-login clearing) may flip it.
    if new.is_guest is distinct from old.is_guest then
      raise exception
        'is_guest can only be changed by an administrator (public.users.is_guest)'
        using errcode = 'insufficient_privilege';
    end if;

    return new;
  end;
$$;

-- ── admin_key_metrics: gjester ut av users_ge1/ge2, beholdt i gjenger ─────────
-- Uendret fra 0126 bortsett fra per_user-CTE-en (join mot users, not is_guest)
-- og funksjons-kommentaren. finished_players og fingerprints er urørt så
-- gjeng-fingerprints beholder gjester (kontinuitet gjennom claim).

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
  '#1010 (0126) + #1009 (0127): read-only Sekretariat-metrics — users/gjenger with >=2 finished '
  'games + 8-week Oslo-truncated trend. Gjeng = exact sorted set of non-withdrawn '
  'user_ids per finished game with >=2 players (known limit: one new player => new '
  'fingerprint). Guest users (is_guest) are excluded from users_ge1/ge2 but kept in '
  'gjeng fingerprints (uuid continuity through claim). SECURITY DEFINER with in-body '
  'is_admin() gate; authenticated only.';
