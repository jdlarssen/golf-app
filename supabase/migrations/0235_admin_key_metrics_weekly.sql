-- 0235_admin_key_metrics_weekly.sql
-- #2345: morgenrapportens ukekort leser «av andre» og påmeldinger via en åpen
-- side per uke fra admin_key_metrics().
--
-- Staging først, prod kun etter eier-ja (prod-brannmuren #1074). Additiv og
-- trygg i begge rekkefølger: parseMetrics leser de to nye feltene som
-- valgfrie, så uten migrasjonen faller bare de to leddene i setningen bort.
--
-- Kroppen er 0180-versjonen urørt, bortsett fra at hver `weeks`-rad får to
-- nye felt:
--
--   by_others:      fullførte spill den Oslo-uka der created_by ikke er en
--                   admin. Samme NOT EXISTS-test som livstegn_games (0180),
--                   så created_by = NULL teller som «av andre».
--   public_signups: ikke-trukne game_players med signup_source satt og
--                   accepted_at i Oslo-uka. Selvpåmelding setter accepted_at
--                   ved innsetting (#463), så tidspunktet er påmeldingen.
--
-- «Admin» = users.is_admin = true. Kun antall, aldri persondata.

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
             count(*) as n,
             -- #2345 (0235): samme «av andre»-test som livstegn_games.
             count(*) filter (
               where not exists (
                 select 1 from public.users u
                 where u.id = g.created_by and u.is_admin
               )
             ) as by_others
      from public.games g
      where g.status = 'finished'
        and g.ended_at is not null
      group by 1
    ),
    -- #2345 (0235): påmeldinger via en åpen side per Oslo-uke.
    signups_per_week as (
      select date_trunc('week', gp.accepted_at at time zone 'Europe/Oslo')::date
               as week_start,
             count(*) as n
      from public.game_players gp
      where gp.signup_source is not null
        and gp.withdrawn_at is null
        and gp.accepted_at is not null
      group by 1
    ),
    -- #1192 (0141): onboarding-funnelen. Én rad per distinkt invitert e-post.
    invite_emails as (
      select lower(i.email) as email,
             bool_or(i.opened_at is not null)   as opened,
             bool_or(i.accepted_at is not null) as accepted
      from public.invitations i
      group by lower(i.email)
    ),
    -- Kohort-brukere: inviterte e-poster matchet case-insensitivt mot aktive,
    -- ikke-gjest-brukere (steg 4–5).
    cohort_users as (
      select u.id, u.profile_completed_at
      from public.users u
      join invite_emails ie on lower(u.email) = ie.email
      where u.deleted_at is null
        and not u.is_guest
    ),
    -- #2119 (0180): livstegnet. Én rad per fullført spill med to flagg.
    livstegn_games as (
      select month_start,
             not admin_created                       as by_others,
             not admin_created and not admin_played  as without_admin
      from (
        select date_trunc('month', g.ended_at at time zone 'Europe/Oslo')::date
                 as month_start,
               exists (
                 select 1 from public.users u
                 where u.id = g.created_by and u.is_admin
               ) as admin_created,
               exists (
                 select 1
                 from public.game_players gp
                 join public.users u on u.id = gp.user_id
                 where gp.game_id = g.id
                   and gp.withdrawn_at is null
                   and u.is_admin
               ) as admin_played
        from public.games g
        where g.status = 'finished'
          and g.ended_at is not null
      ) flagged
    ),
    months as (
      -- Siste 12 Oslo-måneder, eldste først, inneværende sist.
      select (date_trunc('month', now() at time zone 'Europe/Oslo')::date
              - make_interval(months => i))::date as month_start
      from generate_series(11, 0, -1) as i
    ),
    livstegn_per_month as (
      select month_start,
             count(*)                              as finished,
             count(*) filter (where by_others)     as by_others,
             count(*) filter (where without_admin) as without_admin
      from livstegn_games
      group by month_start
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
                   'week_start',     to_char(w.week_start, 'YYYY-MM-DD'),
                   'finished',       coalesce(f.n, 0),
                   'by_others',      coalesce(f.by_others, 0),
                   'public_signups', coalesce(s.n, 0)
                 )
                 order by w.week_start
               )
        from weeks w
        left join finished_per_week f on f.week_start = w.week_start
        left join signups_per_week s on s.week_start = w.week_start
      ),
      -- #1192 (0141): rene antall per steg — aldri persondata.
      'funnel', jsonb_build_object(
        'invited',  (select count(*) from invite_emails),
        'opened',   (select count(*) from invite_emails where opened),
        'accepted', (select count(*) from invite_emails where accepted),
        'profile_completed',
                    (select count(*) from cohort_users
                     where profile_completed_at is not null),
        'first_score',
                    (select count(*) from cohort_users cu
                     where exists (select 1 from public.scores s
                                   where s.user_id = cu.id))
      ),
      -- #2119 (0180): livstegnet per Oslo-måned + totalen over hele tiden.
      'months', (
        select jsonb_agg(
                 jsonb_build_object(
                   'month',         to_char(m.month_start, 'YYYY-MM'),
                   'finished',      coalesce(l.finished, 0),
                   'by_others',     coalesce(l.by_others, 0),
                   'without_admin', coalesce(l.without_admin, 0)
                 )
                 order by m.month_start
               )
        from months m
        left join livstegn_per_month l on l.month_start = m.month_start
      ),
      'livstegn_total', (
        select jsonb_build_object(
                 'finished',      count(*),
                 'by_others',     count(*) filter (where by_others),
                 'without_admin', count(*) filter (where without_admin)
               )
        from livstegn_games
      )
    ) into v_result;

    return v_result;
  end $$;

comment on function public.admin_key_metrics() is
  '#1010 (0126) + #1009 (0127) + #1022 (0128) + #1192 (0141) + #2119 (0180) '
  '+ #2345 (0235): '
  'read-only Sekretariat-metrics — users/gjenger with >=2 finished games, '
  '8-week Oslo-truncated trend (each week also by_others and public_signups '
  'accepted that week), public_signups (acquisition via public page/'
  'poster), the onboarding funnel (distinct invited emails per step: invited/'
  'opened/accepted, then profile_completed/first_score via case-insensitive '
  'email match to active non-guest users; known limit: signup under a '
  'different email misses steps 4-5), and the livstegn: finished games per '
  'Oslo month (12 months) and all-time, split into by_others (created_by not '
  'an admin) and without_admin (also no non-withdrawn admin player). '
  'Aggregates only, never per-person data. SECURITY DEFINER with in-body '
  'is_admin() gate; authenticated only.';

-- 0104-herdingen re-anvendt (create or replace beholder ACL-er, men vi er
-- eksplisitte som i 0126/0127/0128/0141/0180):
revoke all on function public.admin_key_metrics() from public;
revoke execute on function public.admin_key_metrics() from anon;
grant execute on function public.admin_key_metrics() to authenticated;
